Tinytest.add('FastRender - init - coll data ', function(test) {
  var expectedMessages = [
    {msg: 'added', collection: "posts", id: "one", fields: {name: "arunoda"}, frGen: true},
    {msg: 'added', collection: "posts", id: "two", fields: {name: "meteorhacks"}, frGen: true},
    {msg: 'added', collection: "comments", id: "one", fields: {text: "great"}, frGen: true}
  ];

  var payload = {
    subscriptions: {posts: true},
    data: {
      posts: [[
        {_id: "one", name: "arunoda"},
        {_id: "two", name: "meteorhacks"},
      ]],
      comments: [[
        {_id: "one", text: "great"}
      ]]
    }
  };

  var newMessages = [];

  WithNewInjectDdpMessage(function(conn, ddpMessage) {
    newMessages.push(ddpMessage);
  }, function() {
    payload = EncodeEJSON(payload);
    FastRender.init(payload);

    test.equal(newMessages, expectedMessages);
    test.equal(FastRender.subscriptions, payload.subscriptions);
  });
});

Tinytest.addAsync('FastRender - init - ObjectId support', function(test, done) {
  var id = new LocalCollection._ObjectID();
  var payload = {
    subscriptions: {posts: true},
    data: {
      posts: [[
        {_id: id, name: "arunoda"},
      ]]
    }
  };

  WithNewInjectDdpMessage(function(conn, ddpMessage) {
    test.equal(ddpMessage.id, id._str);
    done();
  }, function() {
    payload = EncodeEJSON(payload);
    FastRender.init(payload);
  });
});

Tinytest.add('FastRender - init - merge multiple collection data', function(test) {
  var collName = Random.id();
  var payload = {
    subscriptions: {posts: true},
    data: {

    }
  };

  payload.data[collName] = [
    [{_id: "one", name: "arunoda", age: 20}],
    [{_id: "one", name: "arunoda", age: 30, city: "colombo"}],
    [{_id: "one", plan: "pro"}]
  ];
  
  payload = EncodeEJSON(payload);
  FastRender.init(payload);

  var coll = new Mongo.Collection(collName);
  test.equal(coll.findOne('one'), {
    _id: "one",
    name: "arunoda", 
    age: 30, 
    city: "colombo",
    plan: "pro"
  });
});

Tinytest.add('FastRender - init - ejon data', function(test) {
  var collName = Random.id();
  var payload = {
    subscriptions: {posts: true},
    data: {

    }
  };

  var date = new Date('2014 Oct 20');
  payload.data[collName] = [
    [{_id: "one", name: "arunoda", date: date}],
  ];
  
  payload = EncodeEJSON(payload);
  FastRender.init(payload);

  var coll = new Mongo.Collection(collName);
  var doc = coll.findOne("one");
  test.equal(doc.date.getTime(), date.getTime());
});

WithNewInjectDdpMessage = function(newCallback, runCode) {
  var originalInjectDDP = FastRender.injectDdpMessage;
  FastRender.injectDdpMessage = newCallback;
  if(runCode) runCode();
  FastRender.injectDdpMessage = originalInjectDDP;
};