const express = require('express')
const router = express.Router()
const passport = require('passport')
const { Reader } = require('../models/Reader')
const NoSuchReaderError = require('../errors/no-such-reader')
const { getId } = require('../utils/get-id.js')

const jwtAuth = passport.authenticate('jwt', { session: false })

router
  .route('/reader-:shortId/activity')
  .get(jwtAuth, function (req, res, next) {
    const shortId = req.params.shortId
    Reader.byShortId(shortId, ['outbox'])
      .then(reader => {
        if (`auth0|${req.user}` !== reader.userId) {
          res.status(403).send(`Access to reader ${shortId} disallowed`)
        } else {
          res.setHeader(
            'Content-Type',
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
          )
          res.end(
            JSON.stringify({
              '@context': 'https://www.w3.org/ns/activitystreams',
              summaryMap: {
                en: `Outbox for user with id ${shortId}`
              },
              type: 'OrderedCollection',
              id: getId(`/reader-${shortId}/activity`),
              totalItems: reader.outbox.length,
              orderedItems: reader.outbox.map(item => item.toJSON())
            })
          )
        }
      })
      .catch(err => {
        if (err instanceof NoSuchReaderError) {
          res.status(404).send(err.message)
        } else {
          next(err)
        }
      })
  })
  .post(jwtAuth, function (req, res, next) {
    const shortId = req.params.shortId
    Reader.byShortId(shortId)
      .then(reader => {
        if (`auth0|${req.user}` !== reader.userId) {
          res.status(403).send(`Access to reader ${shortId} disallowed`)
        } else {
          if (!req.is('application/ld+json')) {
            return next(new Error('Body must be JSON-LD'))
          }

          const body = req.body

          if (typeof body !== 'object') {
            return next(new Error('Body must be a JSON object'))
          }

          reader
            .$relatedQuery('outbox')
            .insert(body)
            .then(activity => {
              res.setHeader('Location', activity.url)
              res.sendStatus(201)
              res.end()
            })
            .catch(next)
        }
      })
      .catch(err => {
        if (err instanceof NoSuchReaderError) {
          res.status(404).send(err.message)
        } else {
          next(err)
        }
      })
  })

module.exports = router

module.exports = router
