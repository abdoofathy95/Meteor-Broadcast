# Meteor-Broadcast
meteor web app that supports broadcasting (Many to Many) and viewing that broadcast, with recording and playback of that record 

# Usage
1. Download Kurento Media Server from [Kurento](https://www.kurento.org/)
2. Start The Kurento Service (If on Ubuntu -> sudo service kurento start 
3. Clone the project Or download and start Meteor app using (Meteor run). this app assumes that the media server is running on default port localhost:8888. to change please edit [Server.js] to a remote or local URL.


# Notes
1. This app is meant as a demo and not to be used in production in its current state. (LOTS of security issues).
2. This app doesn't use playbackEndPoint of kurento API as it doesn't support seeking at time of this development. Instead it uses another meteor package [Meteor-File-Collection]https://github.com/vsivsi/meteor-file-collection for importing the recording into a collection and generating an MD5 that's used as part of the url.
3. Leaving a broadcast isn't implemented yet.
