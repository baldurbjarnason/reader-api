'use strict'
const Model = require('objection').Model
const { BaseModel } = require('./BaseModel.js')
const { Publication } = require('./Publication.js')
const { Reader } = require('./Reader.js')
const { Document } = require('./Document.js')
const { Note } = require('./Note.js')
const short = require('short-uuid')
const translator = short()

/**
 *
 * @property {Reader} reader - returns the reader that owns this activity. This is the 'actor' in the activity streams sense
 *
 * @property {Document} document - Returns the document, if any, that was acted upon.
 *
 * @property {Note} note - Returns the note, if any, that was acted upon.
 *
 * @property {Publication} publication - Returns the publication, if any, that was acted upon.
 *
 * `Activity` models the stored activities themselves. `Add`, `Create`, `Remove`, `Undo`, `Redo`, `Update`, and `Read` activities are all stored. `Read` is unique in that it models a _client-side_ not servers side activity. (May add `View` at a later date if needed.)
 *
 * The document, note, and publication fields on the `relationMappings` property are not exclusive. You can have an activity on a document, with no note or publication. And you can have an activity that is the addition of a note to a document in the context of a publication.
 */
class Activity extends BaseModel {
  static get tableName () {
    return 'Activity'
  }
  get path () {
    return 'activity'
  }
  static get jsonSchema () {
    return {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', maxLength: 255 },
        readerId: { type: 'string', format: 'uuid', maxLength: 255 },
        json: {
          type: 'object',
          additionalProperties: true,
          default: {}
        },
        updated: { type: 'string', format: 'date-time' },
        published: { type: 'string', format: 'date-time' }
      },
      additionalProperties: true,
      required: ['json']
    }
  }
  static get relationMappings () {
    return {
      reader: {
        relation: Model.BelongsToOneRelation,
        modelClass: Reader,
        join: {
          from: 'Activity.readerId',
          to: 'Reader.id'
        }
      },
      document: {
        relation: Model.BelongsToOneRelation,
        modelClass: Document,
        join: {
          from: 'Activity.documentId',
          to: 'Document.id'
        }
      },
      note: {
        relation: Model.BelongsToOneRelation,
        modelClass: Note,
        join: {
          from: 'Activity.noteId',
          to: 'Note.id'
        }
      },
      publication: {
        relation: Model.BelongsToOneRelation,
        modelClass: Publication,
        join: {
          from: 'Activity.publicationId',
          to: 'Publication.id'
        }
      }
    }
  }

  summarize () {
    const type = (this.json.type || 'object').toLowerCase()
    const actor = this.reader
      ? this.reader.json.name || this.reader.json.nameMap.en
      : 'someone'
    let summary = `${actor} ${type}d`
    if (this.json.location) {
      const place =
        this.json.location.name || this.json.location.nameMap
          ? this.json.location.nameMap.en
          : 'somewhere'
      summary = `${summary} at ${place}`
    }
    return summary
  }

  static async byShortId (shortId /*: string */) {
    return Activity.query()
      .findById(translator.toUUID(shortId))
      .eager('reader')
  }

  $formatJson (json /*: any */) {
    json = super.$formatJson(json)
    return Object.assign(
      {
        actor: this.reader ? this.reader.asRef() : null
      },
      json
    )
  }
}

module.exports = { Activity }
