var SpotifyWebApi = require('./');
var Promise = require('promise');

require('./credentials');
var spotifyApi = new SpotifyWebApi(credentials);

var open = require('open');
var http = require('http');
var queryString = require('querystring');
var url = require('url');
var express = require('express');

var authorizeUrl = spotifyApi.createAuthorizeURL(['user-read-private', 'playlist-read-private'], null);
var app = express();

var userId = null;
var playlists = [];

app.listen(8080);
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);

// If this is being run locally on the command line, open up
// the homepage in the default browser.
open('http://localhost:8080', function (err) {
  if (err) throw err;
  console.log('The user closed the browser');
});

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

  // Use the 'code' parameter that should be accessible
  // in the callback URL to generate an access token.
  spotifyApi.authorizationCodeGrant(request.query.code)
    .then(function(data) {
      spotifyApi.setAccessToken(data['access_token']);

      return spotifyApi.getMe();
    }, function(error) {
      console.error('Error getting authorization code', error);
    })

    .then(function(user) {
      console.log('Retrieved data for ' + user.display_name + ' (' + user.id + ')');

      userId = user.id;
      return spotifyApi.getUserPlaylists(user.id, {limit: 4});
    }, function(error) {
      console.error('Error getting user profile', error);
    })

    .then(function(data) {
      console.log("Got first page of results for user's playlists");

      playlists = data;

      // Fetch all the subsequent pages of playlists from the API.
      var promises = [];
      for (var i = data.limit; i < data.total; i += data.limit) {
        var extraPage = function() {
          console.log('Getting new page for results ' + i + ' onwards');
          return spotifyApi.getUserPlaylists(userId, {limit: data.limit, offset: i})
            .then(function(playlistPage) {
              console.log('Fetched playlist page ' + playlistPage.offset / playlistPage.limit + ' of ' + Math.floor(playlistPage.total / playlistPage.limit));
              playlists.items = playlists.items.concat(playlistPage.items);
              console.log('Total of ' + playlists.items.length + ' playlists pulled in');
              return true;
            });
        };

        promises.push(extraPage());
      }

      return Promise.all(promises);
    }, function(error) {
      console.error('Error getting user playlists', error);
    })

    .then(function(playlistPages) {
      console.log('Fetched all playlist pages');

      // For each of the retrieved playlists, make a separate
      // API request to fetch a list of its tracks.
      var promises = playlists.items.map(function(playlist) {
        return spotifyApi.getPlaylistTracks(playlist.owner.id, playlist.id)
          .then(function(tracks) {
            playlist.tracks.items = tracks.items;
            return playlist;
          }, function(error) {
            console.log('Error getting playlist tracks page', error); 
          });
      });

      return Promise.all(promises);
    }, function(error) {
      console.error('Error getting additional playlist pages', error);
    })

    .then(function(playlists) {
      showSummary(playlists);

      response.end(JSON.stringify(playlists, null, "\t"));
    }, function(error) {
      console.error('Error getting playlist tracks', error);
    })

    .catch(function(error) {
      console.error('Something went wrong', error);
    });
});

app.get('*', function(request, response) {
  response.redirect('/');
});

/**
 * Logs an overview of the fetched playlists to the console. 
 *
 * @param array playlists Array of playlists
 */
function showSummary(playlists) {
  playlists.forEach(function(playlist) {
    console.log('Playlist "' + playlist.name + '"');

    if (playlist.tracks.items.length) {
      console.log('  Track "' + playlist.tracks.items[0]['track']['name'] + '"');
    } else {
      console.log('  [Empty playlist]');
    }
  });
}
