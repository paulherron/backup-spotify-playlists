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

// Keep a record of the user's ID for use throughout the promise chain.
var userId = null;

// Keep an overall record of all fetched playlists.
var playlists = [];

// Fields to include when getting a user playlist.
var playlistFields = 'offset,limit,total,name,id,href,items(id,name,owner.id)';

// Fields to include when fetching a playlist's tracks.
var trackFields = 'total,limit,offset,items(track(name,href,album(name,href),artists(name,href)))';

app.listen(8080);
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);

// If this is being run locally on the command line, open up
// the homepage in the default browser.
open('http://localhost:8080');

app.get('/', function(request, response) {
    response.render('index.html', {authorizeUrl: authorizeUrl});
});

app.get('/callback', function(request, response) {

  checkAuthorizationCode(request.query.code, response);

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
      return spotifyApi.getUserPlaylists(user.id, {fields: playlistFields});
    }, function(error) {
      console.error('Error getting user profile', error);
    })

    .then(function(userPlaylists) {
      console.log("Got first page of results for user's playlists");

      playlists = userPlaylists.items;

      return getRemainingPlaylistPages(userPlaylists);
    }, function(error) {
      console.error('Error getting user playlists', error);
    })

    .then(function(playlistPages) {
      console.log('Fetched all playlist pages');

      return getTracks();
    })

    .then(function() {
      showSummary(playlists);

      response.end(JSON.stringify(playlists, null, "\t"));
    }, function(error) {
      console.error('Error getting playlists', error);
    })

    .catch(function(error) {
      console.error('Something went wrong', error);
    });
});

app.get('*', function(request, response) {
  response.redirect('/');
});

/**
 * Checks for an authorization code like /callback?code=abc123 in the URL and responds accordingly.
 *
 * @param string code The authorization code, which should have been included in the callback URL that Spotify redirected back to
 * @param object response The response object
 */
function checkAuthorizationCode(code, response) {
  if (code) {
    response.setHeader('Content-disposition', 'attachment; filename=' + new Date().toISOString().slice(0, 10) + '-spotify_playlists.json');
    response.writeHead(200, {'Content-Type': 'application/json'});
  } else {
    response.writeHead(400);
    response.end("Authorization code isn't present");
  }
}

/**
 * Fetches paginated results of the user's playlists, and appends them to the main `playlists` array.
 *
 * @param array userPlaylists The first page of playlist results fetched for the user. Should include 'offset', 'total' and 'limit' params that will inform how the remaining requests will be made.
 * @return object Promise
 */
function getRemainingPlaylistPages(userPlaylists) {
  // Fetch all the subsequent pages of playlists from the API.
  var promises = [];
  for (var i = userPlaylists.limit; i < userPlaylists.total; i += userPlaylists.limit) {
    var extraPage = function() {
      return spotifyApi.getUserPlaylists(userId, {limit: userPlaylists.limit, offset: i, fields: playlistFields})
        .then(function(playlistPage) {
          console.log('Fetched playlist page ' + playlistPage.offset / playlistPage.limit + ' of ' + Math.floor(playlistPage.total / playlistPage.limit));

          playlists = playlists.concat(playlistPage.items);
          console.log('Total of ' + playlists.length + ' playlists pulled in');
          return playlistPage;
        });
    };

    promises.push(extraPage());
  }

  return Promise.all(promises);
}

/**
 * Works through the main list of playlists and inserts all their tracks into them.
 *
 * @param return Promise
 */
function getTracks() {
  // For each of the retrieved playlists, make a separate
  // API request to fetch a list of its tracks.
  var promises = playlists.map(function(playlist) {

    return spotifyApi.getPlaylistTracks(playlist.owner.id, playlist.id, {fields: trackFields})
      .then(function(tracks) {
        playlist.tracks = tracks.items;

        var trackPromises = [];
        for (var i = tracks.limit; i < tracks.total; i += tracks.limit) {
          var extraPage = function() {
            return spotifyApi.getPlaylistTracks(playlist.owner.id, playlist.id, {limit: tracks.limit, offset: i, fields: trackFields})
              .then(function(tracksPage) {
                console.log('Fetched tracks page ' + tracksPage.offset / tracksPage.limit + ' of ' + Math.floor(tracksPage.total / tracksPage.limit));
                playlist.tracks = playlist.tracks.concat(tracksPage.items);
                console.log('Total of ' + playlist.tracks.length + ' tracks pulled in for playlist ' + playlist.name);
                return playlist;
              }, function(error) {
                console.error('Error fetching tracks page with offset ' + i);  
              });
          };

          trackPromises.push(extraPage());
        }

        return Promise.all(trackPromises);
      }, function(error) {
        console.log('Error getting playlist tracks page', error); 
      });
  });

  return Promise.all(promises);
}

/**
 * Logs an overview of the fetched playlists to the console. 
 *
 * @param array playlists Array of playlists
 */
function showSummary(playlists) {
  playlists.forEach(function(playlist) {
    console.log('Playlist "' + playlist.name + '" containing ' + playlist.tracks.length + ' tracks');

    var trackCount = playlist.tracks.length;
    if (trackCount) {
      console.log('  Track "' + playlist.tracks[0]['track']['name'] + '"');

      if (trackCount > 1) {
        var moreMessage = '  and ' + (trackCount - 1) + ' more track';

        if (trackCount > 2) {
          moreMessage += 's';
        }

        console.log(moreMessage);
      }
    } else {
      console.log('  [Empty playlist]');
    }
  });
}
