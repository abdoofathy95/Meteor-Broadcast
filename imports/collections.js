export const baseURL = '/records/';
export const broadcastIds = new Mongo.Collection('broadcastIds'); // hold all ids of broadcasts
export const videos = new FileCollection('videos',
  { resumable: true,
  	baseURL: baseURL,// Enable built-in resumable.js chunked upload support
    http: [             // Define HTTP route
      { method: 'get',  // Enable a GET endpoint
        path: '/:md5',  // this will be at route "/gridfs/myFiles/:md5"
        lookup: function (params, query) {  // uses express style url params
          return { md5: params.md5 };       // a query mapping url to myFiles
				}
			}
				]
	});