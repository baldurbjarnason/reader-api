// test route to GET /whoami

const tap = require('tap')
const request = require('supertest')
const jwt = require('jsonwebtoken')
const debug = require('debug')('hobb:test:get-whoami')

process.env.NODE_ENV = 'development'

const main = async () => {
  let app
  let token

  await tap.test('Environment variables are set', async () => {
    await tap.type(process.env.ISSUER, 'string')
    await tap.type(process.env.SECRETORKEY, 'string')
    debug('Done with environment test')
  })

  await tap.test('App exists', async () => {
    debug('Loading app')
    app = require('../server').app
    await tap.type(app, 'function')
    debug('Done with loading test')
  })

  await tap.test('App initializes correctly', async () => {
    debug('Initializing app')
    tap.ok(!app.initialized)
    debug('Starting initialization')
    await app.initialize()
    debug('Done with initialization')
    tap.ok(app.initialized)
    debug('Done with initialization test')
  })

  await tap.test('GET /whoami with no authentication', async () => {
    debug('Requesting whoami with no auth')
    const res = await request(app)
      .get('/whoami')
      .set('Host', 'reader-api.test')
    debug('Done requesting whoami with no auth')
    await tap.equal(res.statusCode, 401)
    debug('Done with noauth test')
  })

  await tap.test('Create JWT token for new user', async () => {
    await tap.type(process.env.ISSUER, 'string')

    // This should be unique

    const options = {
      subject: `foo${Date.now()}`,
      expiresIn: '24h',
      issuer: process.env.ISSUER
    }

    await tap.type(process.env.SECRETORKEY, 'string')

    token = jwt.sign({}, process.env.SECRETORKEY, options)
    tap.ok(token)
  })

  await tap.test('GET /whoami before posting to /readers', async () => {
    debug('Requesting whoami with auth')

    debug('running request')
    const res = await request(app)
      .get('/whoami')
      .set('Host', 'reader-api.test')
      .set('Authorization', `Bearer ${token}`)

    await tap.equal(res.statusCode, 404)
  })

  await tap.test('POST /readers with no auth', async () => {
    debug('Requesting /readers with auth')

    debug('running request')
    const res = await request(app)
      .post('/readers')
      .set('Host', 'reader-api.test')
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )
      .send(
        JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Person',
          name: 'J. Random Reader'
        })
      )

    await tap.equal(res.statusCode, 401)
  })

  await tap.test('POST /readers', async () => {
    const res = await request(app)
      .post('/readers')
      .set('Host', 'reader-api.test')
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )
      .send(
        JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Person',
          name: 'J. Random Reader'
        })
      )
      .set('Authorization', `Bearer ${token}`)

    await tap.equal(res.statusCode, 201)
    await tap.match(
      res.get('Location'),
      /https:\/\/reader-api.test\/reader-(.*)$/
    )
  })

  await tap.test('POST /readers again', async () => {
    const res = await request(app)
      .post('/readers')
      .set('Host', 'reader-api.test')
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )
      .send(
        JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Person',
          name: 'J. Random Reader'
        })
      )
      .set('Authorization', `Bearer ${token}`)

    await tap.equal(res.statusCode, 400)
  })

  await tap.test('GET /whoami after posting to /readers', async () => {
    debug('Requesting whoami with auth')

    debug('running request')
    const res = await request(app)
      .get('/whoami')
      .set('Host', 'reader-api.test')
      .set('Authorization', `Bearer ${token}`)

    await tap.equal(res.statusCode, 200)

    debug('Testing that it is done')
    await tap.equal(
      res.get('Content-Type'),
      'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
    )

    debug('Testing location header')
    await tap.match(
      res.get('Location'),
      /https:\/\/reader-api.test\/reader-(.*)/
    )

    debug('Getting body')
    const body = res.body

    debug('Testing context')
    await tap.ok(Array.isArray(body['@context']))
    await tap.equal(body['@context'].length, 2)
    await tap.equal(
      body['@context'][0],
      'https://www.w3.org/ns/activitystreams'
    )
    await tap.type(body['@context'][1], 'object')
    await tap.equal(
      body['@context'][1].reader,
      'https://rebus.foundation/ns/reader'
    )

    debug('Testing properties')
    debug(body)

    await tap.match(body.id, /https:\/\/reader-api.test\/reader-(.*)/)
    await tap.equal(body.type, 'Person')
    await tap.match(
      body.outbox,
      /https:\/\/reader-api.test\/reader-(.*)\/activity/
    )
    await tap.equal(typeof body.followers, 'undefined')
    await tap.equal(typeof body.following, 'undefined')
    await tap.equal(typeof body.liked, 'undefined')

    debug('Testing streams')
    await tap.type(body.streams, 'object')
    await tap.match(
      body.streams.id,
      /https:\/\/reader-api.test\/reader-(.*)\/streams/
    )
    await tap.equal(body.streams.type, 'Collection')
    await tap.type(body.streams.summaryMap, 'object')
    await tap.type(body.streams.summaryMap.en, 'string')

    await tap.equal(body.streams.totalItems, 1)
    await tap.ok(Array.isArray(body.streams.items))
    await tap.equal(body.streams.items.length, 1)

    debug('Testing library')
    const library = body.streams.items[0]

    await tap.type(library, 'object')
    await tap.match(
      library.id,
      /https:\/\/reader-api.test\/reader-(.*)\/library/
    )
    await tap.equal(library.type, 'Collection')
    await tap.type(library.summaryMap, 'object')
    await tap.type(library.summaryMap.en, 'string')
    debug('Done with properties')

    return true
  })

  await tap.test('App terminates correctly', async () => {
    debug('Terminating app')
    tap.ok(app.initialized)
    debug('Starting termination')
    await app.terminate()
    debug('Done with termination')
    tap.ok(!app.initialized)
    debug('Done with termination test')
  })
}

main()