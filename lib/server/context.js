var Fibers = Npm.require('fibers');
var Future = Npm.require('fibers/future');

Context = function Context(loginToken, otherParams) {
  this._collectionData = {};
  this._collectionPubMaps = {};
  this._subscriptions = {};
  this._loginToken = loginToken;
  
  _.extend(this, otherParams);

  // get the user
  if(Meteor.users) {    
    // check to make sure, we've the loginToken, 
    // otherwise a random user will fetched from the db
    if(loginToken) {
      var hashedToken = loginToken && Accounts._hashLoginToken( loginToken );
      var query = {'services.resume.loginTokens.hashedToken': hashedToken }; 
      var options = {fields: {_id: 1}};
      var user = Meteor.users.findOne(query, options);
    }

    //support for Meteor.user
    Fibers.current._meteor_dynamics = {};
    Fibers.current._meteor_dynamics[DDP._CurrentInvocation.slot] = this;

    if(user) {
      this.userId = user._id;
    }
  }
};

Context.prototype.subscribe = function(subName /*, params */) {
  var self = this;
  
  var publishHandler = Meteor.default_server.publish_handlers[subName];
  if(publishHandler) {
    var params = Array.prototype.slice.call(arguments, 1);
    var subscription = {name: subName, params: params}
    var publishContext = new PublishContext(this, subscription);

    return this.processPublication(publishHandler, publishContext, params);
  } else {
    console.warn('There is no such publish handler named:', subName);
    return {};
  }
};

Context.prototype.processPublication = function(publishHandler, publishContext, params) {
  var self = this;
  var data = {};
  var ensureCollection = function(collectionName) {
    self._ensureCollection(collectionName);
    if(!data[collectionName]) {
      data[collectionName] = [];
    }
  };

  var future = new Future();
  //detect when the context is ready to be sent to the client
  publishContext.onStop(function() {
    if(!future.isResolved()) {
      future.return();
    }
  });

  try {
    var cursors = publishHandler.apply(publishContext, params);
  } catch(ex) {
    console.warn('error caught on publication: ', publishContext._subscription, ': ', ex.message);
    // since, this subscription caught on an error we can't proceed.
    // but we can't also throws an error since other publications might have something useful
    // So, it's not fair to ignore running them due to error of this sub
    // this might also be failed due to the use of some private API's of Meteor's Susbscription class
    publishContext.ready();
  }

  if(cursors) {
    //the publish function returned a cursor
    if(cursors.constructor != Array) {
      cursors = [cursors];
    }

    //add collection data
    cursors.forEach(function(cursor) {
      publishContext._addCursor(cursor);
    });

    //the subscription is ready
    publishContext.ready();
  } else if(cursors === null) {
    //some developers send null to indicate they are not using the publication
    //this is not the way to go, but meteor's accounts-base also does this
    //so we need some special handling on this
    publishContext.ready();
  }

  if (!future.isResolved()) {
    //don't wait forever for handler to fire ready()
    Meteor.setTimeout(function() {
      if (!future.isResolved()) {
        //publish handler failed to send ready signal in time
        console.warn('Publish handler for', publishContext._subscription, 'sent no ready signal');
        future.return();
      }
    }, 500);  //arbitrarially set timeout to 500ms, should probably be configurable

    // wait for the subscription became ready.
    future.wait();
  }

  // get the data
  _.each(publishContext._collectionData, function(collData, collectionName) {
    ensureCollection(collectionName);
    data[collectionName].push(collData);
    
    // copy the collection data in publish context into the FR context
    self._ensureCollection(collectionName);
    self._collectionData[collectionName].push(collData);
  });

  return data;
};

Context.prototype.completeSubscriptions = function(subscription) {
  var subs = this._subscriptions[subscription.name];
  if(!subs) {
    subs = this._subscriptions[subscription.name] = {};
  }

  subs[EJSON.stringify(subscription.params)] = true;
};

Context.prototype._ensureCollection = function(collectionName) {
  if(!this._collectionData[collectionName]) {
    this._collectionData[collectionName] = [];
  }
};

Context.prototype.getData = function() {
  return {
    collectionData: this._collectionData,
    subscriptions: this._subscriptions,
    loginToken: this._loginToken
  };
};

Context.prototype._added = function(collectionName, id, pubId) {
  if (!this._collectionPubMaps[collectionName])
    this._collectionPubMaps[collectionName] = {};
  var pubMap = this._collectionPubMaps[collectionName];
  if (!pubMap[id])
    pubMap[id] = { publisherCount: 0, isPublishedBy: {} };
  var pubMapForId = pubMap[id];
  var isPublishedBy = pubMapForId.isPublishedBy;
  if (!isPublishedBy[pubId]) {
    isPublishedBy[pubId] = true;
    pubMapForId.publisherCount++;
  }
};

Context.prototype._removed = function(collectionName, id, pubId) {
  if (!this._collectionPubMaps[collectionName] ||
      !this._collectionPubMaps[collectionName][id])
    return;
  var pubMapForId = this._collectionPubMaps[collectionName][id];
  if (pubMapForId.isPublishedBy[pubId]) {
    delete pubMapForId.isPublishedBy[pubId];
    pubMapForId.publisherCount--;    
  }
};

Context.prototype._docIsPublished = function(collectionName, id) {
  if (!this._collectionPubMaps[collectionName] ||
      !this._collectionPubMaps[collectionName][id])
    return false;
  return (this._collectionPubMaps[collectionName][id].publisherCount !== 0);
};

FastRender._Context = Context;