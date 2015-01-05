var SpotifyWebApi = require('./');
var Promise = require('promise');

var open = require('open');
var http = require('http');
var queryString = require('querystring');
var url = require('url');
var express = require('express');

require('./credentials');

var spotifyApi = new SpotifyWebApi(credentials);

var authorizeUrl = spotifyApi.createAuthorizeURL(['user-read-private', 'user-read-email', 'playlist-read-private'], null);

// If this is being run locally on the command line, open up
// the homepage in the default browser.
open('http://localhost:8080', function (err) {
  if (err) throw err;
  console.log('The user closed the browser');
});

var app = express();

app.listen(8080);
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);

app.get('/', function(request, response) {
    response.render('index.html', {authorizeUrl: authorizeUrl});
});

app.get('/callback', function(request, response) {

  // Spotify should have redirected back to this callback URL with a valid access code 
  // in the URL, like /callback?code=abc123.
  if (request.query.code) {
    response.setHeader('Content-disposition', 'attachment; filename=' + new Date().toISOString().slice(0, 10) + '-spotify_playlists.json');
    response.writeHead(200, {'Content-Type': 'application/json'});
  } else {
    response.writeHead(400);
    response.end("Authorization code isn't present");
  }

  // Use the 'code' paramater that should be accessible in the 
  // callback URL to generate an access token.
  spotifyApi.authorizationCodeGrant(request.query.code)
    .then(function(data) {
      spotifyApi.setAccessToken(data['access_token']);

      return spotifyApi.getMe();
    })
    .then(function(user) {
      console.log('Retrieved data for ' + user.display_name + ' (' + user.id + ')');

      return spotifyApi.getUserPlaylists(user.id, {limit: 50});
    })
    .then(function(data) {
      console.log(data);

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
      response.end(JSON.stringify(playlists, null, "\t"));
    })
    .catch(function(err) {
      console.log('Something went wrong', err);
    });

});

app.get('*', function(request, response) {
  response.redirect('/');
});


console.log('Server started');
