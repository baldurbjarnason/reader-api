const request = require('supertest')
const tap = require('tap')
const urlparse = require('url').parse
const {
  getToken,
  createUser,
  destroyDB,
  getActivityFromUrl,
  createPublication,
  createNote
} = require('../utils/utils')
const { urlToId } = require('../../utils/utils')
const { Document } = require('../../models/Document')
const { Reader } = require('../../models/Reader')
const { Note_Tag } = require('../../models/Note_Tag')
const { Note } = require('../../models/Note')

const test = async app => {
  if (!process.env.POSTGRE_INSTANCE) {
    await app.initialize()
  }

  const token = getToken()
  const readerId = await createUser(app, token)
  const readerUrl = urlparse(readerId).path

  // Create Reader object
  const person = {
    name: 'J. Random Reader'
  }
  const reader1 = await Reader.createReader(readerId, person)

  const resActivity = await createPublication(app, token, readerUrl)

  const pubActivityUrl = resActivity.get('Location')
  const pubActivityObject = await getActivityFromUrl(app, pubActivityUrl, token)
  const publication = pubActivityObject.object

  // Create a Document for that publication
  const documentObject = {
    mediaType: 'txt',
    url: 'http://google-bucket/somewhere/file1234.txt',
    documentPath: '/inside/the/book.txt',
    json: { property1: 'value1' }
  }
  const document = await Document.createDocument(
    reader1,
    publication.id,
    documentObject
  )

  const documentUrl = `${publication.id}${document.documentPath}`

  // create Note for reader 1
  const noteActivity = await createNote(app, token, readerUrl, {
    inReplyTo: documentUrl,
    context: publication.id
  })

  // get the urls needed for the tests
  const noteActivityUrl = noteActivity.get('Location')

  const noteActivityObject = await getActivityFromUrl(
    app,
    noteActivityUrl,
    token
  )
  const noteUrl = noteActivityObject.object.id

  // create Tag
  await request(app)
    .post(`${readerUrl}/activity`)
    .set('Host', 'reader-api.test')
    .set('Authorization', `Bearer ${token}`)
    .type(
      'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
    )
    .send(
      JSON.stringify({
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          { reader: 'https://rebus.foundation/ns/reader' }
        ],
        type: 'Create',
        object: {
          type: 'reader:Stack',
          name: 'mystack',
          json: { property: 'value' }
        }
      })
    )

  // get tag object by fetching the library
  const libraryRes = await request(app)
    .get(`${readerUrl}/library`)
    .set('Host', 'reader-api.test')
    .set('Authorization', `Bearer ${token}`)
    .type(
      'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
    )

  const stack = libraryRes.body.tags[0]

  await tap.test(
    'Try to delete a Tag with a tagId that does not exist',
    async () => {
      const res = await request(app)
        .post(`${readerUrl}/activity`)
        .set('Host', 'reader-api.test')
        .set('Authorization', `Bearer ${token}`)
        .type(
          'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
        )
        .send(
          JSON.stringify({
            '@context': [
              'https://www.w3.org/ns/activitystreams',
              { reader: 'https://rebus.foundation/ns/reader' }
            ],
            type: 'Delete',
            object: {
              type: 'Tag',
              id: stack.id + 'blah'
            }
          })
        )

      await tap.equal(res.statusCode, 404)
      const error = JSON.parse(res.text)
      await tap.equal(error.statusCode, 404)
      await tap.equal(error.details.type, 'Tag')
      await tap.equal(error.details.activity, 'Delete Tag')
    }
  )

  await tap.test('Try to delete a Tag with a null tagId', async () => {
    const res = await request(app)
      .post(`${readerUrl}/activity`)
      .set('Host', 'reader-api.test')
      .set('Authorization', `Bearer ${token}`)
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )
      .send(
        JSON.stringify({
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            { reader: 'https://rebus.foundation/ns/reader' }
          ],
          type: 'Delete',
          object: {
            type: 'Tag',
            id: null
          }
        })
      )

    await tap.equal(res.statusCode, 404)
    const error = JSON.parse(res.text)
    await tap.equal(error.statusCode, 404)
    await tap.equal(error.details.type, 'Tag')
    await tap.equal(error.details.activity, 'Delete Tag')
  })

  await tap.test('Delete a Tag', async () => {
    // Get the library before the modifications
    const libraryBefore = await request(app)
      .get(`${readerUrl}/library`)
      .set('Host', 'reader-api.test')
      .set('Authorization', `Bearer ${token}`)
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )

    // Add a tag to the note
    await Note_Tag.addTagToNote(urlToId(noteUrl), libraryBefore.body.tags[0].id)

    // Fetch the note with the tag
    const noteWithTag = await Note.byId(urlToId(noteUrl))
    await tap.equal(noteWithTag.tags.length, 1)
    await tap.equal(noteWithTag.tags[0].name, libraryBefore.body.tags[0].name)
    await tap.equal(libraryBefore.body.tags.length, 1)
    await tap.equal(libraryBefore.body.tags[0].name, stack.name)

    // Delete the tag
    const res = await request(app)
      .post(`${readerUrl}/activity`)
      .set('Host', 'reader-api.test')
      .set('Authorization', `Bearer ${token}`)
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )
      .send(
        JSON.stringify({
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            { reader: 'https://rebus.foundation/ns/reader' }
          ],
          type: 'Delete',
          object: {
            type: 'Tag',
            id: stack.id
          }
        })
      )

    await tap.equal(res.statusCode, 204)

    // Get the library after the modifications
    const libraryAfter = await request(app)
      .get(`${readerUrl}/library`)
      .set('Host', 'reader-api.test')
      .set('Authorization', `Bearer ${token}`)
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )

    // Get the note after the modifications
    const noteWithoutTag = await Note.byId(urlToId(noteUrl))

    await tap.equal(libraryAfter.body.tags.length, 0)
    await tap.equal(libraryAfter.body.items[0].tags.length, 0)
    await tap.equal(noteWithoutTag.tags.length, 0)
  })

  await tap.test('Try to delete a Tag that was already deleted', async () => {
    const res = await request(app)
      .post(`${readerUrl}/activity`)
      .set('Host', 'reader-api.test')
      .set('Authorization', `Bearer ${token}`)
      .type(
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
      )
      .send(
        JSON.stringify({
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            { reader: 'https://rebus.foundation/ns/reader' }
          ],
          type: 'Delete',
          object: {
            type: 'Tag',
            id: stack.id
          }
        })
      )

    await tap.equal(res.statusCode, 404)
    const error = JSON.parse(res.text)
    await tap.equal(error.statusCode, 404)
    await tap.equal(error.details.type, 'Tag')
    await tap.equal(error.details.activity, 'Delete Tag')
  })

  if (!process.env.POSTGRE_INSTANCE) {
    await app.terminate()
  }
  await destroyDB(app)
}

module.exports = test