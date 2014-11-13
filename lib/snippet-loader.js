var util = require( 'lz-node-utils' );
var fs = require( 'fs' );
var path = require( 'path' );
var _ = require( 'underscore' );
var yamlfront = require( 'yaml-front-matter' ); // https://github.com/dworthen/js-yaml-front-matter

module.exports = ( function() {

	var model = {};
	var tagIdByName = {};

	return {
		load: function( config ) {

			if ( !config ) {
				throw new Error( 'No config specified' );
			} else if ( !config.snippetSource ) {
				throw new Error( 'No snippetSource specified' );
			}

			// Get all of the snippet files
			var snippetFiles = util.file.expand( config.snippetSource );

			model.snippets = _.map( snippetFiles, function( snippetPath, idx ) {
				// Read in the file
				var snippetContents = util.file.read( snippetPath );

				var snippetYamlDefaults = {
					// We reserve the __id and __filepath keys
					__id: idx + 1,
					__filepath: snippetPath,
					// If this is left blank, the snippet name will be inferred
					// from the filename.
					abbreviation: '',
					// Strictly speaking, the default language should
					// be determined by the translator. Its ok for now, dash
					// is the only exporter that uses this field currently.
					language: 'None',
					tags: []
				};

				// Grab the yaml front matter
				var snippetYaml = yamlfront.loadFront( snippetContents.trim() );

				// Reserve the __id key
				if ( !!snippetYaml.__id ) {
					throw new Error( '__id is a reserved key for snippets; in: ' + snippetPath );
				}
				// Reserve the __filepath key
				if ( !!snippetYaml.__filepath ) {
					throw new Error( '__filepath is a reserved key for snippets; in: ' + snippetPath );
				}

				// Get the final snippetData
				var snippetData = _.defaults( snippetYaml, snippetYamlDefaults );

				// Infer abbreviation from the filename if not specified
				if ( !snippetData.abbreviation ) {
					snippetData.abbreviation = path.basename( snippetPath, '.snippet' );
				}

				// Do some checking to see if a directory level prefix is defined
				// (used in picking a prefix)
				var dirPrefixPath = path.dirname( snippetPath ) + '/dir.abbreviationPrefix';
				var hasDirPrefix = fs.existsSync( dirPrefixPath );

				// Pick a prefix
				var desiredPrefix = '';
				if ( typeof snippetData.abbreviationPrefix === 'string' ) {
					// Use the snippet's prefix, if specified
					desiredPrefix = snippetData.abbreviationPrefix;
				} else if ( hasDirPrefix ) {
					// Use the dirPrefix if it exists
					desiredPrefix = fs.readFileSync( dirPrefixPath ).toString().trim();
				} else if ( typeof config.abbreviationPrefix === 'string' ) {
					// Use the config's abbreviationPrefix
					desiredPrefix = config.abbreviationPrefix;
				}

				// Prepend the prefix to the abbreviation
				snippetData.abbreviation = desiredPrefix + snippetData.abbreviation;

				// Do the translation
				if ( config.translator ) {
					// Error check up in here
					if ( !config.translator.translate ) {
						throw new Error( 'Expected translator to define a translate() function.' );
					} else if ( config.translator.translate && typeof config.translator.translate !== 'function' ) {
						throw new Error( 'Expected typeof translateFn === \'function\'' );
					}
					// Let the translator do its thing
					snippetData.__content = config.translator.translate( snippetData );
				}

				// No newline for you (the yaml-front parsing adds one for some reaosn)
				if ( snippetData.__content[ 0 ] === '\n' ) {
					snippetData.__content = snippetData.__content.substr( 1 );
				}

				// If the translator defines a snipTeardown function call it now
				if ( config.translator && config.translator.snipTeardown ) {
					config.translator.snipTeardown();
				}

				// BOOM!
				return snippetData;

			} );

			// Get the tags out of the model
			model.tags = _.chain( model.snippets )
				// Get the tags from all of the snippets
				.map( function( d ) {
					return d.tags;
				} )
				// Flatten the resulting array
				.flatten()
				// Remove dupes, and sort
				.unique()
				.sort()
				// Turn each tag into an object with an id and a name
				.map( function( tag, idx ) {
					return {
						__id: idx + 1,
						name: tag
					};
				} )
				// Take this opportunity to build a map from tagname to id
				.tap( function( tags ) {
					_.each( tags, function( tag ) {
						tagIdByName[ tag.name ] = tag.__id;
					} );
				} )
				.value();

			return model;
		},
		getTagId: function( forTag ) {
			return tagIdByName[ forTag ];
		}
	};
}() );
