// import collections 
import {broadcastIds, videos} from '/imports/collections.js';

var ws_uri = "ws://localhost:8888/kurento";
/*
NOTE : in kurento API , the media object you connect to is a SINK and the one connecting to that 
      is the src

      !IMPORTANT: comments with !Important must be changed according to your needs
      */
      if (Meteor.isServer) {
        console.log('configuring kurento media server on url: '+ws_uri);

        var kurento = require('kurento-client'); 
  candidatesQueue = {}; // holds candidates while webRTCEndPoint gets initialized ([broadcastId])
  broadcasts = []; // list of all broadcaster
  viewers = []; // list of all viewers ([broadcastId][viewerSessionId])
  base_file_uri = "file:///tmp"; //(!IMPORTANT CHANGE ME) default location for files recorded 
  videoStream.permissions.write(function(eventName) {
    return true;
  });

  videoStream.permissions.read(function(eventName) {
    return true;
  });

  videoStream.on('clientMessage', function(_message) {

    var message = JSON.parse(_message);

    switch (message.id) {
      case 'broadcaster':

      var sdpAnswer = startBroadcast(message.broadcastId, message.sdpOffer); 

      if (sdpAnswer.lastIndexOf('Error: ', 0) === 0) {
        return videoStream.emit("serverMessage", JSON.stringify({
          id : 'broadcasterResponse',
          response : 'rejected',
          message : sdpAnswer
        }));
      }

      videoStream.emit("serverMessage", JSON.stringify({
        id : 'broadcasterResponse',
        response : 'accepted',
        sdpAnswer : sdpAnswer
      }));

      break;

      case 'viewer':

      var sdpAnswer =  startViewer(message.broadcastId, message.viewerSessionId, message.sdpOffer);

      if (sdpAnswer.lastIndexOf('Error: ', 0) === 0) {
        return videoStream.emit("serverMessage", JSON.stringify({
          id : 'viewerResponse',
          response : 'rejected',
          message : error
        }));
      }

      videoStream.emit("serverMessage",JSON.stringify({
        id : 'viewerResponse',
        response : 'accepted',
        sdpAnswer : sdpAnswer
      }));

      break;

      case 'startRecording':
      startRecording(message.broadcastId);
      break;

      case 'stopRecording':
      stopRecording(message.broadcastId);
      break;

      case 'stopBroadcast':
      stopBroadcast(message.broadcastId);
      break;

      case 'leaveBroadcast':
      //leaveBroadcast(message.broadcastId, message.viewerSessionId);
      break;

      case 'onIceCandidate':
      onIceCandidate(message.broadcastId, message.viewerSessionId, message.viewingSessionId, 
        message.candidate);
      break;

      default:
      videoStream.emit("serverMessage",JSON.stringify({
        id : 'error',
        message : 'Invalid message ' + message
      }));
      break;
    }
  });

  // broadcast
  function startBroadcast(broadcastId, sdpOffer) {
    clearCandidatesQueue(broadcastId);

    broadcasts[broadcastId] = { // can broadcast, record, watch recorded videos
      broadcastPipeline : null,
      webRtcEndpoint : null,
      recorderEndpoint: null, // for recording
      fileId: null // save a reference to the last recorded file
    }
    var mediaProfile = 'MP4';
    const fileName = Random.id(20) + '.' + mediaProfile; // file name
    var file_uri = base_file_uri+'/'+ fileName; // whole url

    var recordParams = {
      stopOnEndOfStream: true,
      mediaProfile: mediaProfile,
      uri: file_uri
    }

    if (broadcasts[broadcastId] === null) {
      stopBroadcast(broadcastId);
    }
    var syncedClient = Meteor.wrapAsync(kurento);
    kurentoClient = syncedClient(ws_uri);

    var syncedPipeline = Meteor.wrapAsync(kurentoClient.create,kurentoClient);
    broadcastPipeline = syncedPipeline('MediaPipeline');

    broadcasts[broadcastId].broadcastPipeline = broadcastPipeline;
    
    var syncedwebRtc = Meteor.wrapAsync(broadcastPipeline.create,broadcastPipeline);
    var webRtcEndpoint = syncedwebRtc('WebRtcEndpoint');

    var recorderEndpoint = syncedwebRtc('RecorderEndpoint', recordParams);

    broadcasts[broadcastId].webRtcEndpoint = webRtcEndpoint;
    broadcasts[broadcastId].recorderEndpoint = recorderEndpoint;

    // connect recorder as a Sink
    var connectRecorder = Meteor.wrapAsync(webRtcEndpoint.connect,webRtcEndpoint);
    connectRecorder(recorderEndpoint);
    broadcasts[broadcastId].fileId = fileName;

    if (candidatesQueue[broadcastId]) {
      while(candidatesQueue[broadcastId].length) {
        var candidate = candidatesQueue[broadcastId].shift();
        webRtcEndpoint.addIceCandidate(candidate);
      }
    }

    webRtcEndpoint.on('OnIceCandidate', function(event) {
      var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
      videoStream.emit("serverMessage",JSON.stringify({
        id : 'iceCandidate',
        candidate : candidate
      }));
    });

    var syncedOffer = Meteor.wrapAsync(webRtcEndpoint.processOffer,webRtcEndpoint);
    var sdpAnswer = syncedOffer(sdpOffer);

    var syncedGatherCandidates = Meteor.wrapAsync(webRtcEndpoint.gatherCandidates,webRtcEndpoint);
    syncedGatherCandidates();

    return sdpAnswer;   
  }

  // viewers
  function startViewer(broadcastId, viewerSessionId, sdpOffer) {
    clearCandidatesQueue(broadcastId);

    var syncedwebRtc = Meteor.wrapAsync(broadcasts[broadcastId].broadcastPipeline.create, 
      broadcasts[broadcastId].broadcastPipeline);
    var webRtcEndpoint = syncedwebRtc('WebRtcEndpoint');

    if(!viewers[broadcastId]){
      viewers[broadcastId] = []
    }

    viewers[broadcastId][viewerSessionId] = {
      "webRtcEndpoint" : webRtcEndpoint
    }

    if (candidatesQueue[broadcastId]) {
      while(candidatesQueue[broadcastId].length) {
        var candidate = candidatesQueue[broadcastId].shift();
        webRtcEndpoint.addIceCandidate(candidate);
      }
    }

    webRtcEndpoint.on('OnIceCandidate', function(event) {
      if(!kurento){ 
        console.log('this candidate comes but no kurento here.')
        return; 
      }
      var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
      videoStream.emit("serverMessage",JSON.stringify({
        id : 'iceCandidate',
        candidate : candidate
      }));
    });


    var syncedOffer = Meteor.wrapAsync(webRtcEndpoint.processOffer,webRtcEndpoint);
    var sdpAnswer = syncedOffer(sdpOffer);

    var syncedConnect = Meteor.wrapAsync(broadcasts[broadcastId].webRtcEndpoint.connect, 
      broadcasts[broadcastId].webRtcEndpoint);
    var connectNow = syncedConnect(webRtcEndpoint); 

    var syncedGatherCandidates = Meteor.wrapAsync(webRtcEndpoint.gatherCandidates,webRtcEndpoint);
    syncedGatherCandidates();

    return sdpAnswer; 
  }


  // record
  function startRecording(broadcastId){
    var recorder = broadcasts[broadcastId].recorderEndpoint;
    recorder.record();
    return videoStream.emit("serverMessage", JSON.stringify({
      id : 'record',
      status : 'recording'
    }));
  }

  //stop recording
  function stopRecording(broadcastId){
    var fileName = broadcasts[broadcastId].fileId; // file name
    var recorder = broadcasts[broadcastId].recorderEndpoint;
    recorder.stop();
    recorder.release();
    Meteor.call('insertVideo', fileName);
    return videoStream.emit("serverMessage", JSON.stringify({
      id : 'record',
      status : 'stop'
    }));
  }

  function clearCandidatesQueue(broadcastId) {
    if (candidatesQueue[broadcastId]) {
      delete candidatesQueue[broadcastId];
    }
  }

  function stopBroadcast(broadcastId) {
    if (broadcasts[broadcastId] !== null && viewers[broadcastId]) {
      for (var i in viewers[broadcastId]) {
        var viewer = viewers[broadcastId][i];
        if (viewer.ws) {
          viewer.ws.send(JSON.stringify({
            id : 'stopCommunication'
          }));
        }
      }
      broadcasts[broadcastId].broadcastPipeline.release();
      broadcasts[broadcastId] = null;
      viewers[broadcastId] = [];

    } else if (viewers[broadcastId]) {
      for (var i in viewers[broadcastId]) {
        var viewer = viewers[broadcastId][i];
        viewer.webRtcEndpoint.release();
      }
      delete viewers[broadcastId];
    }

    clearCandidatesQueue(broadcastId);
  }

  function onIceCandidate(broadcastId, viewerSessionId, viewingSessionId, _candidate) { // add video ID HERE
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);
    console.log('onIceCanditate broadcastId:'+broadcastId);
    if ( !viewerSessionId && broadcasts[broadcastId] && broadcasts[broadcastId].webRtcEndpoint) {
      console.info('Sending broadcaster candidate');
      broadcasts[broadcastId].webRtcEndpoint.addIceCandidate(candidate);
    }
    else if ( viewerSessionId && viewers[broadcastId] && viewers[broadcastId][viewerSessionId] && 
      viewers[broadcastId][viewerSessionId] .webRtcEndpoint) {
      console.info('Sending viewer candidate');
    viewers[broadcastId][viewerSessionId].webRtcEndpoint.addIceCandidate(candidate);
  }
  else {

    if (!candidatesQueue[broadcastId]) {
      candidatesQueue[broadcastId] = [];
    }
    candidatesQueue[broadcastId].push(candidate);
  }
}
}

Meteor.methods({
  insertBroadcast: function (broadcastId){
    broadcastIds.insert({_id: broadcastId});
  },
  removeBroadcast: function (broadcastId){
    broadcastIds.remove({_id: broadcastId});
  },
  insertVideo: function (videoName){
    const videoBaseUrl = base_file_uri.substring(7)+'/';
    videos.importFile(videoBaseUrl + videoName,
              { filename: videoName,
                contentType: 'video/mp4'
              },
              function(err, file) {
                // Deal with it
                // Or file contains all of the details.
                console.log(err, file);
              });
  },
  removeVideo: function(videoId){
    videos.remove({_id: videoId});
  }
});

Meteor.publish('allBroadcasts', function() {
  return broadcastIds.find();
});

Meteor.publish('allVideos', function () {  // !IMPORTANT TO BE CONFIGURED ACCORDINGLY
    return videos.find();
});

videos.allow({ // !IMPORTANT TO BE CONFIGURED ACCORDINGLY
  read: function (userId, file) { return true; },  // EVERYONE can READ!
  remove: function (userId, file) { return true; }  // EVERYONE can remove!
});