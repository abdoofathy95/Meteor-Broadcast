import {broadcastIds, videos, baseURL} from '/imports/collections.js';

function checkPermissions(){

  cordova.plugins.diagnostic.isCameraAuthorized(function(authorized){

    console.log("App is " + (authorized ? "authorized" : "denied") + " access to the camera");

    if(!authorized) {
      cordova.plugins.diagnostic.requestCameraAuthorization(function(granted){
        console.log("Authorization request for camera use was " + (granted ? "granted" : "denied"));

        cordova.plugins.diagnostic.isMicrophoneAuthorized(function(authorized){
          console.log("App is " + (authorized ? "authorized" : "denied") + " access to the microphone");

          if(!authorized) {
           cordova.plugins.diagnostic.requestMicrophoneAuthorization()(function(granted){
            console.log("Microphone access is: "+(granted ? "granted" : "denied"));


          }, function(error){
            console.error("The following error occurred: "+error);
          });      
         }
       }, function(error){
        console.error("The following error occurred: "+error);
      });

      }, function(error){
        console.error(error);
      });
    }

  }, function(error){
    console.error("The following error occurred: "+error);
  });

}

if(Meteor.isCordova){ // mobile permissions (to view and broadcast from mobile)
  Meteor.startup(function () {
    if(window.device.platform === 'iOS') cordova.plugins.iosrtc.registerGlobals();
  });

  checkPermissions();
}

if (Meteor.isClient) {
  var liveVideo;
  var recordedVideo;
  var webRtcPeer;
  var webRtcPeerPlayer;
  var status; // not used yet
  const BROADCASTER = 0; // not used yet
  const VIEWER = 1; // not used yet
  const VIEW_VIDEO = 2; // not used yet
  var kurentoUtils = require('kurento-utils');
  
  Template.video.rendered = function() {

    liveVideo = document.getElementById('liveVideo');
    recordedVideo = document.getElementById('recordedVideo');
    videoStream.on('serverMessage', function(message) {

      var parsedMessage = JSON.parse(message);
      console.info('Received message: ' + parsedMessage.id);
      
      switch (parsedMessage.id) {
        case 'broadcasterResponse':
        broadcasterResponse(parsedMessage);
        break;
        case 'viewerResponse':
        viewerResponse(parsedMessage);
        break;
        case 'record':
        recordResponse(parsedMessage);
        break;
        case 'stopCommunication':
        dispose();
        break;
        case 'iceCandidate':
        webRtcPeer.addIceCandidate(parsedMessage.candidate)
        break;
        case 'iceCandidateVideo':
        webRtcPeerPlayer.addIceCandidate(parsedMessage.candidate);
        break;
        default:
        console.error('Unrecognized message', parsedMessage);
      }
    });
  }

  Template.video.helpers({
    activeBroadcasts: function () {
      Meteor.subscribe("allBroadcasts");
      return broadcastIds.find();
    },
    isBroadcaster: function (){ // not used yet
      return status === BROADCASTER;
    },
    recordedVideos: function() {
      Meteor.subscribe("allVideos");
      return videos.find();
    }
  });

  Template.video.events({
    'click #startBroadcast': function () {
      const broadcastId = Random.id(17); 
      Session.set("broadcastId", broadcastId);
      $('#endBroadCast').prop('disabled', false);
      broadcastInit();
    },
    'click #endBroadCast': function () { // not done
      const broadcastId = Session.get("broadcastId");
      stopBroadcast(broadcastId);
      Meteor.call("removeBroadcast", broadcastId);
      $('#endBroadCast').prop('disabled', true);
      $('#startRecord').prop('disabled', true);
      $('#endRecord').prop('disabled', true);
    },
    'click #startRecord': function () {
      const broadcastId = Session.get("broadcastId");
      startRecording(broadcastId);
    },
    'click #endRecord': function () {
      const broadcastId = Session.get("broadcastId");
      stopRecording(broadcastId);
    },
    'click #playVideo': function () {
      const videoMd5 = $('#selectVideo option:selected').attr('url');
      if(videoMd5){
        loadVideo(videoMd5);
      }
    },
    'click #download': function () {
      // not yet done
      const videoId = $('#selectVideo').val(); // try to fetch the id of the video not its name
      
    },
    'click #startView': function () {
      const broadcastId = $('#selectBroadcast').val();
      const viewerSessionId = Random.id(17);
      if(broadcastId){
        Session.set("broadcastId", broadcastId);
        Session.set("viewerSessionId", viewerSessionId);
        viewerInit();
      }
    },
    'click #endView': function () { // not done
      const broadcastId = Session.get("broadcastId");
      const viewerSessionId = Session.get("viewerSessionId");
      $('#endView').prop('disabled', true);
    },
  });

  function broadcasterResponse(message) { // acknowledge connection here (like three way handshake)
    if (message.response != 'accepted') {
      var errorMsg = message.message ? message.message : 'Unknow error';
      console.warn('Call not accepted for the following reason: ' + errorMsg);
      dispose();
    } else {
      webRtcPeer.processAnswer(message.sdpAnswer);
      status = BROADCASTER;
      const broadcastId = Session.get("broadcastId");
      Meteor.call("insertBroadcast", broadcastId);
      $('#endBroadCast').prop('disabled', false);
      $('#startRecord').prop('disabled', false);
    }
  }

  function viewerResponse(message) { // acknowledge connection here (like three way handshake)
    if (message.response != 'accepted') {
      var errorMsg = message.message ? message.message : 'Unknow error';
      console.warn('Call not accepted for the following reason: ' + errorMsg);
      dispose();
    } else {
      webRtcPeer.processAnswer(message.sdpAnswer);
      status = VIEWER;
      $('#endView').prop('disabled', false);
    }
  }

  function broadcastInit() {
    if (!webRtcPeer) {
      showSpinner(liveVideo);

      var options = {
        localVideo: liveVideo,
        onicecandidate : onIceCandidate
      }

      webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
        if(error) return onError(error);

        this.generateOffer(onOfferBroadcaster);
      });
    }
  }

  function onOfferBroadcaster(error, offerSdp) {
    if (error) return onError(error);

    const broadcastId = Session.get("broadcastId");
    var message = {
      id : 'broadcaster',
      sdpOffer : offerSdp,
      broadcastId: broadcastId
    };
    sendMessage(message);
  }

  function viewerInit() {
    if (!webRtcPeer) {
      showSpinner(liveVideo);

      var options = {
        remoteVideo: liveVideo,
        onicecandidate : onIceCandidate
      }

      webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
        if(error) return onError(error);

        this.generateOffer(onOfferViewer);
      });
    }
  }

  function onOfferViewer(error, offerSdp) {
    if (error) return onError(error)

      const broadcastId = Session.get("broadcastId");
      const viewerSessionId = Session.get("viewerSessionId");
      var message = {
        id : 'viewer',
        sdpOffer : offerSdp,
        broadcastId: broadcastId,
        viewerSessionId: viewerSessionId
      }
      sendMessage(message);
    }

    function onIceCandidate(candidate) {
      const broadcastId = Session.get("broadcastId");
      const viewerSessionId = Session.get("viewerSessionId");
      const viewingSessionId = Session.get("viewingSessionId");
     var message = {
      id : 'onIceCandidate',
      candidate : candidate,
      broadcastId : broadcastId,
      viewerSessionId : viewerSessionId,
      viewingSessionId : viewingSessionId
    }
    sendMessage(message);
  }

  // start recording 
  function startRecording(broadcastId){
    var message = {
        id : 'startRecording',
        broadcastId: broadcastId
      }
      sendMessage(message);
  }

  // recording status
  function recordResponse(message){
    if(message.status == 'recording'){
    $('#endRecord').prop('disabled', false); // enable stop button
    }else if(message.status == 'stop'){
      $('#startRecord').prop('disabled', false);  // enable start button
      $('#endRecord').prop('disabled', true); // disable stop button
    }
  }

  // stop recording
  function stopRecording(broadcastId){
    var message = {
        id : 'stopRecording',
        broadcastId: broadcastId
      }
      sendMessage(message);
  }
  
  // load video
  function loadVideo(videoMd5){
    console.log(baseURL);
    recordedVideo.src = baseURL + videoMd5;
    $('#recordedVideo').prop('controls', true);
  }

  // download video



  // end connection (send stop signal to remove)
  function stopBroadcast(broadcastId) {
    if (webRtcPeer) {
      var message = {
        id : 'stopBroadcast',
        broadcastId: broadcastId
      }
      sendMessage(message);
      dispose();
    }
  }

  // release resources for webRtcPeer
  function dispose() {
    if (webRtcPeer) {
      webRtcPeer.dispose();
      webRtcPeer = null;
    }
    hideSpinner(liveVideo);
  }

  // part of signaling protocol
  function sendMessage(message) {
    var jsonMessage = JSON.stringify(message);
    videoStream.emit("clientMessage", jsonMessage);
  }


  // edit spinner here
  function showSpinner() {
    for (var i = 0; i < arguments.length; i++) {
      arguments[i].poster = './img/transparent-1px.png';
      arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
    }
  }

  function hideSpinner() {
    for (var i = 0; i < arguments.length; i++) {
      arguments[i].src = '';
      arguments[i].poster = './img/webrtc.png';
      arguments[i].style.background = '';
    }
  }

}