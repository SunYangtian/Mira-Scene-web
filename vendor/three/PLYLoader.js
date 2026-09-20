import {
	BufferGeometry,
	FileLoader,
	Float32BufferAttribute,
	Loader,
	Color,
	SRGBColorSpace
} from './three.module.js';

const _color = new Color();

class PLYLoader extends Loader {

	constructor( manager ) {

		super( manager );
		this.propertyNameMapping = {};

	}

	load( url, onLoad, onProgress, onError ) {

		const scope = this;
		const loader = new FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( url, function ( text ) {

			try {

				onLoad( scope.parse( text ) );

			} catch ( e ) {

				if ( onError ) onError( e );
				else console.error( e );
				scope.manager.itemError( url );

			}

		}, onProgress, onError );

	}

	setPropertyNameMapping( mapping ) {

		this.propertyNameMapping = mapping;
		return this;

	}

	parse( data ) {

		function parseHeader( data, propertyNameMapping ) {

			const patternHeader = /ply([\s\S]*)end_header\r?\n/;
			let headerText = '';
			let headerLength = 0;
			const result = patternHeader.exec( data );
			if ( result !== null ) {

				headerText = result[ 1 ];
				headerLength = new TextEncoder().encode( result[ 0 ] ).length;

			}
			const header = { comments: [], elements: [], headerLength: headerLength, objInfo: '' };
			const lines = headerText.split( /\r?\n/ );
			let currentElement;
			function make_ply_element_property( propertValues, propertyNameMapping ) {

				const property = { type: propertValues[ 0 ] };
				if ( property.type === 'list' ) {

					property.countType = propertValues[ 1 ];
					property.itemType = propertValues[ 2 ];
					property.name = propertValues[ 3 ];

				} else {

					property.name = propertValues[ 1 ];

				}
				if ( property.name in propertyNameMapping ) property.name = propertyNameMapping[ property.name ];
				return property;

			}
			for ( let i = 0; i < lines.length; i ++ ) {

				let line = lines[ i ].trim();
				if ( line === '' ) continue;
				const lineValues = line.split( /\s+/ );
				const lineType = lineValues.shift();
				line = lineValues.join( ' ' );
				switch ( lineType ) {

					case 'format': header.format = lineValues[ 0 ]; header.version = lineValues[ 1 ]; break;
					case 'comment': header.comments.push( line ); break;
					case 'element':
						if ( currentElement !== undefined ) header.elements.push( currentElement );
						currentElement = { name: lineValues[ 0 ], count: parseInt( lineValues[ 1 ] ), properties: [] };
						break;
					case 'property': currentElement.properties.push( make_ply_element_property( lineValues, propertyNameMapping ) ); break;
					case 'obj_info': header.objInfo = line; break;

				}

			}
			if ( currentElement !== undefined ) header.elements.push( currentElement );
			return header;

		}

		function parseASCIINumber( n, type ) {

			switch ( type ) {

				case 'char': case 'uchar': case 'short': case 'ushort': case 'int': case 'uint': case 'int8': case 'uint8': case 'int16': case 'uint16': case 'int32': case 'uint32': return parseInt( n );
				case 'float': case 'double': case 'float32': case 'float64': return parseFloat( n );

			}

		}

		function parseASCIIElement( properties, line ) {

			const values = line.split( /\s+/ );
			const element = {};
			for ( let i = 0; i < properties.length; i ++ ) {

				if ( properties[ i ].type === 'list' ) {

					const list = [];
					const n = parseASCIINumber( values.shift(), properties[ i ].countType );
					for ( let j = 0; j < n; j ++ ) list.push( parseASCIINumber( values.shift(), properties[ i ].itemType ) );
					element[ properties[ i ].name ] = list;

				} else element[ properties[ i ].name ] = parseASCIINumber( values.shift(), properties[ i ].type );

			}
			return element;

		}

		function createBuffer() { return { indices: [], vertices: [], normals: [], uvs: [], faceVertexUvs: [], colors: [] }; }
		function handleElement( buffer, elementName, element ) {

			if ( elementName === 'vertex' ) {

				buffer.vertices.push( element.x, element.y, element.z );
				if ( 'nx' in element && 'ny' in element && 'nz' in element ) buffer.normals.push( element.nx, element.ny, element.nz );
				if ( 's' in element && 't' in element ) buffer.uvs.push( element.s, element.t );
				else if ( 'u' in element && 'v' in element ) buffer.uvs.push( element.u, element.v );
				if ( 'red' in element && 'green' in element && 'blue' in element ) {

					_color.setRGB( element.red / 255, element.green / 255, element.blue / 255, SRGBColorSpace );
					buffer.colors.push( _color.r, _color.g, _color.b );

				}

			} else if ( elementName === 'face' ) {

				const vertexIndices = element.vertex_indices || element.vertex_index;
				if ( vertexIndices.length === 3 ) buffer.indices.push( vertexIndices[ 0 ], vertexIndices[ 1 ], vertexIndices[ 2 ] );
				else if ( vertexIndices.length === 4 ) buffer.indices.push( vertexIndices[ 0 ], vertexIndices[ 1 ], vertexIndices[ 3 ], vertexIndices[ 1 ], vertexIndices[ 2 ], vertexIndices[ 3 ] );

			}

		}

		function postProcess( buffer ) {

			const geometry = new BufferGeometry();
			if ( buffer.indices.length > 0 ) geometry.setIndex( buffer.indices );
			geometry.setAttribute( 'position', new Float32BufferAttribute( buffer.vertices, 3 ) );
			if ( buffer.normals.length > 0 ) geometry.setAttribute( 'normal', new Float32BufferAttribute( buffer.normals, 3 ) );
			if ( buffer.uvs.length > 0 ) geometry.setAttribute( 'uv', new Float32BufferAttribute( buffer.uvs, 2 ) );
			if ( buffer.colors.length > 0 ) geometry.setAttribute( 'color', new Float32BufferAttribute( buffer.colors, 3 ) );
			geometry.computeBoundingSphere();
			return geometry;

		}

		function parseASCII( data, header ) {

			const buffer = createBuffer();
			const body = data.slice( header.headerLength ).split( /\r?\n/ );
			let line = 0;
			for ( let i = 0; i < header.elements.length; i ++ ) {

				const element = header.elements[ i ];
				for ( let j = 0; j < element.count; j ++ ) handleElement( buffer, element.name, parseASCIIElement( element.properties, body[ line ++ ] ) );

			}
			return postProcess( buffer );

		}

		function binaryRead( dataview, at, type, littleEndian ) {

			switch ( type ) {

				case 'int8': case 'char': return [ dataview.getInt8( at ), 1 ];
				case 'uint8': case 'uchar': return [ dataview.getUint8( at ), 1 ];
				case 'int16': case 'short': return [ dataview.getInt16( at, littleEndian ), 2 ];
				case 'uint16': case 'ushort': return [ dataview.getUint16( at, littleEndian ), 2 ];
				case 'int32': case 'int': return [ dataview.getInt32( at, littleEndian ), 4 ];
				case 'uint32': case 'uint': return [ dataview.getUint32( at, littleEndian ), 4 ];
				case 'float32': case 'float': return [ dataview.getFloat32( at, littleEndian ), 4 ];
				case 'float64': case 'double': return [ dataview.getFloat64( at, littleEndian ), 8 ];

			}

		}

		function binaryReadElement( dataview, at, properties, littleEndian ) {

			const element = {}; let result, read = 0;
			for ( let i = 0; i < properties.length; i ++ ) {

				if ( properties[ i ].type === 'list' ) {

					const list = [];
					result = binaryRead( dataview, at + read, properties[ i ].countType, littleEndian ); read += result[ 1 ];
					for ( let j = 0; j < result[ 0 ]; j ++ ) { result = binaryRead( dataview, at + read, properties[ i ].itemType, littleEndian ); read += result[ 1 ]; list.push( result[ 0 ] ); }
					element[ properties[ i ].name ] = list;

				} else { result = binaryRead( dataview, at + read, properties[ i ].type, littleEndian ); read += result[ 1 ]; element[ properties[ i ].name ] = result[ 0 ]; }

			}
			return [ element, read ];

		}

		function parseBinary( data, header ) {

			const buffer = createBuffer();
			const dataview = new DataView( data, header.headerLength );
			let at = 0;
			for ( let i = 0; i < header.elements.length; i ++ ) {

				const element = header.elements[ i ];
				for ( let j = 0; j < element.count; j ++ ) { const read = binaryReadElement( dataview, at, element.properties, header.format === 'binary_little_endian' ); at += read[ 1 ]; handleElement( buffer, element.name, read[ 0 ] ); }

			}
			return postProcess( buffer );

		}

		let text = '';
		if ( data instanceof ArrayBuffer ) text = new TextDecoder().decode( new Uint8Array( data, 0, Math.min( data.byteLength, 5000 ) ) );
		else text = data;
		const header = parseHeader( text, this.propertyNameMapping );
		if ( header.format === 'ascii' ) return parseASCII( new TextDecoder().decode( data ), header );
		return parseBinary( data, header );

	}

}

export { PLYLoader };
