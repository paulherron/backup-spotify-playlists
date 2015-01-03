var SpotifyWebApi = require('./'),
  open = require('open'),
  http = require('http'),
  queryString = require('querystring'),
  url = require('url');

require('./credentials');

/* Set the credentials given on Spotify's My Applications page.
 * https://developer.spotify.com/my-applications
 */
var spotifyApi = new SpotifyWebApi(credentials);

var authorizeUrl = spotifyApi.createAuthorizeURL(['user-read-private', 'user-read-email', 'playlist-read-private'], null);

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

  //response.setHeader('Content-disposition', 'attachment; filename=' + new Date().toISOString().slice(0, 10) + '-spotify_playlists.json');
  response.writeHead(200, {'Content-Type': 'application/json'});

  // First retrieve an access token
  spotifyApi.authorizationCodeGrant(urlParams.code)
    .then(function(data) {
      console.log('Retrieved access token', data['access_token']);

      // Set the access token
      spotifyApi.setAccessToken(data['access_token']);
      spotifyApi.setRefreshToken(data['refresh_token']);
      console.log('token', data);

      // Save the amount of seconds until the access token expired
      tokenExpirationEpoch = (new Date().getTime() / 1000) + data['expires_in'];
      console.log('Retrieved token. It expires in ' + Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) + ' seconds!');

      // Use the access token to retrieve information about the user connected to it
      return spotifyApi.getMe();
    })
    .then(function(user) {
      console.log('Retrieved data for ' + user['display_name'] + ' (' + user.id + ')');

      return spotifyApi.getUserPlaylists(user.id);
    })
    .then(function(data) {
      console.log(data.items.length);

      //response.writeHead(200, {'Content-Type': 'text/csv'});

      //data.items.forEach(function(playlist, index) {
        //console.log((index+1) + '. ' + playlist.name + ' (available at ' + playlist.uri + ')');
      //});

      response.end(JSON.stringify(data.items));
    })
    .catch(function(err) {
      console.log('Something went wrong', err);
    });

}).listen(8080);

console.log('Server started');
