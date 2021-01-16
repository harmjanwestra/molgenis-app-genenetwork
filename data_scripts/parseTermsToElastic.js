var _ = require('lodash')
var async = require('async')
var level = require('level')
var elasticsearch = require('elasticsearch')
// read address of elasticsearch host
var PropertiesReader = require('properties-reader');
var properties = PropertiesReader('config/config.properties');
var elasticHostAddress = properties.get('ELASTICSEARCH_HOST');
// get the location of the GN files
var genenetworkFilePath = properties.get('GN_FILES_PATH')


var client = new elasticsearch.Client({
    host: elasticHostAddress,
    log: 'info'
})

var db = level(genenetworkFilePath+'/level/new/dbexternal_uint16be', {valueEncoding: 'binary'})

async.waterfall([
    function(cb) {
        var numTotal = 0
        db.createValueStream({start: '!RNASEQ!', end: '!RNASEQ!~', valueEncoding: 'json'})
            .on('data', function(data) {
                numTotal += data.length
            })
            .on('end', function() {
                console.log(numTotal, 'terms in total')
                cb(null, numTotal)
            })
    },
   function(numTotal, cb) {
        var bulk = []
        var numBatched = 0
        db.createReadStream({start: '!RNASEQ!', end: '!RNASEQ!~', valueEncoding: 'json'})
            .on('data', function(data) {
                console.log(data.key, data.value.length + ' terms')
                _.forEach(data.value, function(term) {
                    bulk.push({
                        create: {
                            _index: 'search',
                            _type: 'term',
                            _id: term.id
                        }
                    })
                    bulk.push({
                        id: term.id,
                        name: term.name,
                        database: term.database,
                        type: term.id.indexOf('HP:') === 0 ? 'phenotype' : 'pathway',
                        numGenes: term.numAnnotatedGenes
                    })
                    if (++numBatched === numTotal) {
                        cb(null, bulk)
                    }
                })
            }).on('end', function() {
            })
    }], function(err, bulk) {
        console.log('writing bulk, numTerms:', bulk.length / 2)
        client.bulk({body: bulk}, function(err, resp) {
            if (err) console.log(err)
            else console.log('bulk written parseTermsToElastic')
        })
    })
