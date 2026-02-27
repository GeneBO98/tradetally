async function captureControllerResult(handler, req) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const result = {
      statusCode: 200,
      body: undefined,
      headers: {},
      cookies: [],
      clearedCookies: []
    };

    const finalize = () => {
      if (!finished) {
        finished = true;
        resolve(result);
      }
    };

    const res = {
      req,
      locals: {},
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        finalize();
        return this;
      },
      send(body) {
        result.body = body;
        finalize();
        return this;
      },
      end(body) {
        if (body !== undefined) {
          result.body = body;
        }
        finalize();
        return this;
      },
      set(field, value) {
        result.headers[field.toLowerCase()] = value;
        return this;
      },
      header(field, value) {
        if (value === undefined) {
          return result.headers[field.toLowerCase()];
        }
        result.headers[field.toLowerCase()] = value;
        return this;
      },
      get(field) {
        return result.headers[field.toLowerCase()];
      },
      type(value) {
        result.headers['content-type'] = value;
        return this;
      },
      location(value) {
        result.headers.location = value;
        return this;
      },
      cookie(...args) {
        result.cookies.push(args);
        return this;
      },
      clearCookie(...args) {
        result.clearedCookies.push(args);
        return this;
      },
      redirect(statusOrUrl, maybeUrl) {
        if (typeof maybeUrl === 'string') {
          result.statusCode = statusOrUrl;
          result.headers.location = maybeUrl;
        } else {
          result.statusCode = 302;
          result.headers.location = statusOrUrl;
        }
        finalize();
        return this;
      }
    };

    Promise.resolve(handler(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      finalize();
    })).then(() => {
      finalize();
    }).catch(reject);
  });
}

module.exports = {
  captureControllerResult
};
