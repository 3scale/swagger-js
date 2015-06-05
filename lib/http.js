'use strict';

var helpers = require('./helpers');
var request = require('superagent');
var jsyaml = require('js-yaml');

/*
 * SuperagentHttpClient is a light-weight, node or browser HTTP client
 */
var SuperagentHttpClient = function () {};

function isParseable(contentType) {
  // Must be a string
  if(typeof contentType !== 'string') { return false; }

  // Normalize
  contentType = contentType.trim().toLowerCase();

  // matches +yaml or /yaml, +yml or /yml at the end of string
  if (contentType.match(/[+\/]ya?ml$/)) { return true; }

  // matches +json or /json at the end of string
  if (contentType.match(/[+\/]json$/)) { return true; }

  return false;
}

/**
 * SwaggerHttp is a wrapper for executing requests
 */
var SwaggerHttp = module.exports = function () {};

SwaggerHttp.prototype.execute = function (obj, opts) {
  var client;

  if(opts && opts.client) {
    client = opts.client;
  }
  else {
    client = new SuperagentHttpClient(opts);
  }

  // legacy support
  // if ((obj && obj.useJQuery === true) || this.isInternetExplorer()) {
  //   client = new JQueryHttpClient(opts);
  // }

  var success = obj.on.response;

  var responseInterceptor = function(data) {
    if(opts && opts.responseInterceptor) {
      data = opts.responseInterceptor.apply(data);
    }
    success(data);
  };

  obj.on.response = function(data) {
    responseInterceptor(data);
  };

  if (obj && typeof obj.body === 'object') {
    // special processing for file uploads via jquery
    if (obj.body.type && obj.body.type === 'formData'){
      obj.contentType = false;
      obj.processData = false;

      delete obj.headers['Content-Type'];
    } else {
      obj.body = JSON.stringify(obj.body);
    }
  }

  var transport = null;

  if (opts && opts.transport) {
    transport = opts.transport;
  } else {
    transport = function(httpClient, obj) {
                    // do before request stuff
                    // ....

                    // execute the http request
                    var result = httpClient.execute(obj);

                    // do after request stuff
                    // ...

                    // remember to return the result
                    return result;
                };
  }

  return transport(client, obj);
};

SuperagentHttpClient.prototype.execute = function (obj) {
  var method = obj.method.toLowerCase();

  if (method === 'delete') {
    method = 'del';
  }
  var headers = obj.headers || {};
  var r = request[method](obj.url);
  var name;

  for (name in headers) {
    r.set(name, headers[name]);
  }

  if (obj.body) {
    r.send(obj.body);
  }

  if(typeof r.buffer === 'function') {
    r.buffer(); // force superagent to populate res.text with the raw response data
  }

  r.end(function (err, res) {
    res = res || {
      status: 0,
      headers: {error: 'no response from server'}
    };
    var response = {
      url: obj.url,
      method: obj.method,
      headers: res.headers
    };
    var cb;

    if (!err && res.error) {
      err = res.error;
    }

    if (err && obj.on && obj.on.error) {
      response.obj = err;
      response.status = res ? res.status : 500;
      response.statusText = res ? res.text : err.message;
      cb = obj.on.error;
    } else if (res && obj.on && obj.on.response) {
      // res.body can return an empty obj '{}' if it fails
      var possibleObj;

      // Already parsed by by superagent?
      if(res.body && Object.keys(res.body).length > 0) {
        possibleObj = res.body;
      } else {
        // Try to parse from res.text...
        // ...if we have something to parse AND we know how to parse it....
        var contentType = res.headers['content-type'] || res.headers['Content-Type'];
        if(res.text && isParseable(contentType)) {
          try {
            possibleObj = jsyaml.safeLoad(res.text);
          } catch(e) {
            helpers.log('Cannot parse JSON/YAML content');
          }
        }
      }

      // null means we can't parse into object
      response.obj = possibleObj || null;

      response.status = res.status;
      response.statusText = res.text;
      cb = obj.on.response;
    }
    response.data = response.statusText;

    if (cb) {
      cb(response);
    }
  });
};
