'use strict'

const express = require('express')
const app = express()
const compression = require('compression')
const passport = require('passport')
const helmet = require('helmet')
// const csrf = require('csurf')
const { Strategy, ExtractJwt } = require('passport-jwt')
const elasticsearchQueue = require('./processFiles/searchQueue')
const epubQueue = require('./processFiles/index')
const cache = require('./utils/cache')

const activityRoute = require('./routes/activity')
const publicationRoute = require('./routes/publication')
const readerLibraryRoute = require('./routes/reader-library')
const readerStreamsRoute = require('./routes/reader-streams')
const readerRoute = require('./routes/reader')
const whoamiRoute = require('./routes/whoami')
const inboxRoute = require('./routes/inbox')
const readersRoute = require('./routes/readers')
const getOutboxRoute = require('./routes/outbox-get')
const postOutboxRoute = require('./routes/outbox-post')
const fileUploadRoute = require('./routes/file-upload')
const noteRoute = require('./routes/note')
const publicationDocumentRoute = require('./routes/publication-document')
const readerNotesRoute = require('./routes/reader-notes')
const searchRoute = require('./routes/search')
const getJobRoute = require('./routes/job-get')
const fileUploadPubRoute = require('./routes/file-upload-pub')

// new routes
const publicationPostRoute = require('./routes/publication-post')

const errorHandling = require('./routes/middleware/error-handling')

const setupKnex = async skip_migrate => {
  let config

  config = require('./knexfile.js')['postgresql']
  app.knex = require('knex')(config)
  if (!skip_migrate) {
    await app.knex.migrate.rollback()
    await app.knex.migrate.latest()
  }
  const objection = require('objection')
  const Model = objection.Model
  Model.knex(app.knex)
  return null
}

const setupPassport = () => {
  var opts = {}
  opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken()
  opts.secretOrKey = process.env.SECRETORKEY
  opts.issuer = process.env.ISSUER
  opts.audience = process.env.AUDIENCE
  passport.use(
    new Strategy(opts, (jwt, callback) => {
      callback(null, jwt.sub)
    })
  )
}

setupPassport()

// Security settings
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net/npm/redoc@next/'
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ['blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        imgSrc: ['*', 'data:', 'https:'],
        frameSrc: [
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com'
        ],
        fontSrc: ["'self'"],
        formAction: ["'self'", 'https://rebus.auth0.com/'],
        frameAncestors: ["'none'"]
      }
    }
  })
)

// Basic Settings
app.enable('strict routing')
app.set('trust proxy', true)
app.use(express.urlencoded({ extended: true }))
app.use(
  express.json({
    type: [
      'application/json',
      'application/activity+json',
      'application/ld+json'
    ],
    limit: '100mb'
  })
)
app.use(compression())
app.use(passport.initialize())

/**
 * @swagger
 * /:
 *   get:
 *     tags:
 *       - general
 *     description: GET /
 *     produces:
 *       - text/html:
 *     responses:
 *       200:
 *         description: confirmation that the api is running
 *         content:
 *           text/html:
 *             properties:
 *               running:
 *                 type: string
 *                 enum: ['true']
 *
 */
app.get('/', function (req, res) {
  return res.format({
    'text/html': function () {
      res.send('Running!')
    },
    'application/json': function () {
      return res.send({ running: true })
    }
  })
})

app.initialized = false

app.initialize = async skip_migrate => {
  if (!app.initialized) {
    await setupKnex(skip_migrate)
    app.initialized = true
  }
  return app.initialized
}

app.terminate = async () => {
  if (!app.initialized) {
    throw new Error('App not initialized; cannot terminate')
  }
  app.initialized = false
  if (elasticsearchQueue) {
    await elasticsearchQueue.clean(0)
    await elasticsearchQueue.clean(0, 'failed')
    await elasticsearchQueue.empty()
    elasticsearchQueue.close()
  }
  if (epubQueue) {
    await epubQueue.clean(0)
    await epubQueue.clean(0, 'failed')
    await epubQueue.empty()
    epubQueue.close()
  }
  if (cache) {
    cache.quitCache()
  }
  return await app.knex.destroy()
}

activityRoute(app)
publicationRoute(app)
readerLibraryRoute(app)
readerStreamsRoute(app)
readerRoute(app)
whoamiRoute(app)
inboxRoute(app)
readersRoute(app)
getOutboxRoute(app)
postOutboxRoute(app)
fileUploadRoute(app)
noteRoute(app)
publicationDocumentRoute(app)
readerNotesRoute(app)
searchRoute(app)
getJobRoute(app)
fileUploadPubRoute(app)

// new routes
publicationPostRoute(app)

app.use(errorHandling)

app.start = port => {
  app.listen(port, () => console.log('Listening'))
}

module.exports = {
  // Export app for reuse in other express apps/servers
  app,
  start (port) {
    app.start(port)
  }
}
