var SpotifyWebApi = require('./');

var open = require('open');
var http = require('http');
var queryString = require('querystring');
var url = require('url');
var Promise = require('promise');

require('./credentials');

var spotifyApi = new SpotifyWebApi(credentials);

var authorizeUrl = spotifyApi.createAuthorizeURL(['user-read-private', 'user-read-email', 'playlist-read-private'], null);

// If this is being run locally on the command line, open up
// the authorize page in the default browser.
open(authorizeUrl, function (err) {
  if (err) throw err;
  console.log('The user closed the browser');
});

http.createServer(function (request, response) {
  console.log(request.url);

  // Redirect to the authorize URL, which in turn should bring the 
  // user back to the /callback URL with the authorization code appended.
  if (request.url.indexOf('/callback', -1)) {
    response.writeHead(302, {'Location': authorizeUrl});
    response.end();
  }

  var urlParts = url.parse(request.url);
  var urlParams = queryString.parse(urlParts.query);

  if (typeof urlParams.code == 'undefined') {
    response.writeHead(400);
    response.end("Authorization code isn't present");
  }

  response.setHeader('Content-disposition', 'attachment; filename=' + new Date().toISOString().slice(0, 10) + '-spotify_playlists.json');
  response.writeHead(200, {'Content-Type': 'application/json'});

  var output = [];

  // Use the 'code' paramater that should be accessible in the 
  // callback URL to generate an access token.
  spotifyApi.authorizationCodeGrant(urlParams.code)
    .then(function(data) {
      spotifyApi.setAccessToken(data['access_token']);

      return spotifyApi.getMe();
    })
    .then(function(user) {
      console.log('Retrieved data for ' + user.display_name + ' (' + user.id + ')');

      return spotifyApi.getUserPlaylists(user.id);
    })
    .then(function(data) {

      // For each of the retrieved playlists, make a separate
      // API request to fetch a list of its tracks.
      var promises = data.items.map(function(playlist) {
        return spotifyApi.getPlaylistTracks(playlist.owner.id, playlist.id)
          .then(function(tracks) {
            playlist.tracks.items = tracks.items;
            return playlist;
          });
      });

      return Promise.all(promises);
    }).then(function(playlists) {
      output.push(playlists);
      response.end(JSON.stringify(playlists, null, "\t"));
    })
    .catch(function(err) {
      console.log('Something went wrong', err);
    });

}).listen(8080);

console.log('Server started');
