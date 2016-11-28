// getting tokens for the first time
//  Meteor calls Meteor._localStorage.setItem() on the boot
//  But we can do it ourselves also with this
Meteor.startup(function() {
  var token = Cookie.get('meteor_login_token');
  if(token){
    Meteor._localStorage.setItem('Meteor.loginToken', token);
    Meteor._localStorage.setItem('Meteor.loginTokenExpires', Accounts._tokenExpiration(new Date));
  }
  resetToken();
});

// override Meteor._localStorage methods and resetToken accordingly
var originalSetItem = Meteor._localStorage.setItem;
Meteor._localStorage.setItem = function(key, value) {
  if(key == 'Meteor.loginToken') {
    Meteor.defer(resetToken);
  }
  originalSetItem.call(Meteor._localStorage, key, value);
};

var originalRemoveItem = Meteor._localStorage.removeItem;
Meteor._localStorage.removeItem = function(key) {
  if(key == 'Meteor.loginToken') {
    Meteor.defer(resetToken);
  }
  originalRemoveItem.call(Meteor._localStorage, key);
}

function resetToken() {
  var loginToken = Meteor._localStorage.getItem('Meteor.loginToken');
  var loginTokenExpires = new Date(Meteor._localStorage.getItem('Meteor.loginTokenExpires'));

  if(loginToken) {
    setToken(loginToken, loginTokenExpires);
  } else {
    setToken(null, -1);
  }
}

function setToken(loginToken, expires) {
  var domain = _.last(location.hostname.split('.'), 2).join('.');
  var opt = {
    path: '/',
    expires: expires
  };
  if(domain !== 'localhost')
    opt.domain = domain;
  Cookie.set('meteor_login_token', loginToken, opt);
}