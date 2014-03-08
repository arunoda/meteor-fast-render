var Fibers = Npm.require('fibers');
var Future = Npm.require('fibers/future');

Context = function Context(loginToken) {
  this._collectionData = {};
  this._subscriptions = {};
  this._subscriptionFutures = [];

  //get the user
  if(Meteor.users) {
    var hashedToken, query;
    if ( typeof Accounts._hashLoginToken === 'function' ){
      hashedToken = loginToken && Accounts._hashLoginToken( loginToken );
      query = {'services.resume.loginTokens.hashedToken': hashedToken }; 
    }
    else
      query = {'services.resume.loginTokens.token': loginToken};
    var options = {fields: {_id: 1}};
    var user = Meteor.users.findOne(query, options);

    //support for Meteor.user
    Fibers.current._meteor_dynamics = {};
    Fibers.current._meteor_dynamics[DDP._CurrentInvocation.slot] = this;

    if(user) {
      this.userId = user._id;
    }
  }
};

Context.prototype.find = function(collectionName, query, options) {
  var self = this;
  if(collectionName.constructor == Meteor.Collection) {
    collectionName = collectionName._name;
  } else if(typeof collectionName != 'string') {
    throw new Error("find's first arg should be either a Meteor.Collection or a string");
  }

  var mongo = MongoInternals.defaultRemoteCollectionDriver().mongo;
  if(mongo && mongo.db) {
    var future = new Future();
    var args = Array.prototype.slice.call(arguments, 1);
    var coll = mongo.db.collection(collectionName);

    coll.find.apply(coll, args).toArray(function(err, result) {
      if(err) {
        throw err;
      } else {
        self._ensureCollection(collectionName);
        self._collectionData[collectionName].push(result);
        future.return();
      }
    });
    future.wait();
  } else {
    console.warn('fast-render still cannot access the mongo connection');
  }
};

Context.prototype.subscribe = function(subscription /*, params */) {
  var self = this;
  var publishHandler = Meteor.default_server.publish_handlers[subscription];
  if(publishHandler) {
    var future = new Future;
    this._subscriptionFutures.push(future);
    var publishContext = new PublishContext(this, subscription);

    //detect when the context is ready to be sent to the client
    publishContext.onStop(function() {
      if(!future.isResolved()) {
        future.return();
      }
    });

    var params = Array.prototype.slice.call(arguments, 1);
    var cursors = publishHandler.apply(publishContext, params);

    if(cursors) {
      //the publish function returned a cursor
      if(cursors.constructor != Array) {
        cursors = [cursors];
      }

      //add collection data
      cursors.forEach(function(cursor) {
        cursor.rewind();
        var collectionName = 
          (cursor._cursorDescription)? cursor._cursorDescription.collectionName: null || //for meteor-collections
          (cursor._collection)? cursor._collection._name: null; //for smart-collections

        self._ensureCollection(collectionName);
        self._collectionData[collectionName].push(cursor.fetch());
      });

      //the subscription is ready
      publishContext.ready();
    }

    if (!future.isResolved()) {
      //don't wait forever for handler to fire ready()
      Meteor.setTimeout(function() {
        if (!future.isResolved()) {
          //publish handler failed to send ready signal in time
          console.warn('Publish handler for', subscription, 'sent no ready signal');
          future.return();
        }
      }, 300);  //arbitrarially set timeout to 300ms, should probably be configurable
    }
  } else {
    console.warn('There is no such publish handler named:', subscription);
  }
};

Context.prototype.completeSubscriptions = function(subscriptions) {
  var self = this;
  if(typeof subscriptions == 'string') {
    subscriptions = [subscriptions];
  } else if(!subscriptions || subscriptions.constructor != Array) {
    throw new Error('subscriptions params should be either a string or array of strings');
  }

  subscriptions.forEach(function(subscription) {
    self._subscriptions[subscription] = true;
  });
};

Context.prototype._ensureCollection = function(collectionName) {
  if(!this._collectionData[collectionName]) {
    this._collectionData[collectionName] = [];
  }
};

Context.prototype.getData = function() {
  // Ensure that all of the subscriptions are ready
  this._subscriptionFutures.forEach(function(future) {
    future.wait();
  });

  return {
    collectionData: this._collectionData,
    subscriptions: this._subscriptions
  };
};

FastRender._Context = Context;

