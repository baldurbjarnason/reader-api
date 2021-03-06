const Queue = require('bull')
const request = require('request')
const { Storage } = require('@google-cloud/storage')
const utils = require('../utils/utils')
const storage = new Storage()
require('dotenv').config()

let elasticsearchQueue

/*
code that was in upload endpoint
                  if (
                    (document.mediaType === 'text/html' ||
                      document.mediaType === 'application/xhtml+xml') &&
                    elasticsearchQueue
                  ) {
                    elasticsearchQueue.add({
                      type: 'add',
                      fileName: file.name,
                      bucketName: bucketName,
                      document: doc,
                      pubId: id
                    })
                  }

*/

// skipping this in travis in pull requests because it doesn't have access to redis password
if (process.env.REDIS_PASSWORD) {
  elasticsearchQueue = new Queue('elasticsearch', {
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    }
  })

  elasticsearchQueue.process(async (job, done) => {
    data = job.data
    if (data.type === 'add') {
      const readingFileStream = storage
        .bucket(data.bucketName)
        .file(data.fileName)
        .createReadStream()
      let buf = ''
      readingFileStream
        .on('data', function (d) {
          buf += d
        })
        .on('end', async () => {
          request.post(
            `${process.env.ELASTIC_SEARCH_URL}/document/_doc/`,
            {
              auth: {
                username: process.env.ELASTIC_SEARCH_LOGIN,
                password: process.env.ELASTIC_SEARCH_PASSWORD
              },
              body: JSON.stringify({
                name: data.fileName,
                readerId: utils.urlToId(data.document.readerId),
                publicationId: utils.urlToId(data.pubId),
                documentUrl: data.document.url,
                documentPath: data.document.documentPath,
                content: buf
              }),
              headers: { 'content-type': 'application/json' }
            },
            (err, res) => {
              if (err) console.log('indexing error: ', err)
              done()
            }
          )
        })
    } else if (data.type === 'delete') {
      request.post(
        `${process.env.ELASTIC_SEARCH_URL}/document/_delete_by_query`,
        {
          auth: {
            username: process.env.ELASTIC_SEARCH_LOGIN,
            password: process.env.ELASTIC_SEARCH_PASSWORD
          },
          body: JSON.stringify({
            query: {
              term: { publicationId: data.publicationId }
            }
          }),
          headers: { 'content-type': 'application/json' }
        },
        async (err, res) => {
          if (err) console.log(err)
          done()
        }
      )
    }
  })
}

module.exports = elasticsearchQueue
