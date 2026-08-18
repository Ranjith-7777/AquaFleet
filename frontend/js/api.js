/* Shared HTTP client for the AquaFleet Flask API. */
(function exposeAquaFleetApi(global) {
  "use strict";

  const API_BASE_URL = "http://127.0.0.1:5000";

  /* Called once whenever a PROTECTED request comes back 401, so the SPA can
     drop straight to the login screen instead of showing a broken table.
     Registered by auth.js; null until then. */
  let unauthorizedHandler = null;

  /* /api/auth/* is exempt. Those endpoints answer 401 as their normal reply
     - "nobody is logged in" - and routing that through the handler would
     make the login screen re-trigger itself on every page load. It also
     keeps a 403 from an inactive LOGIN attempt on the login form instead of
     bouncing the screen it is already showing. */
  const AUTH_PATH_PATTERN = /^\/api\/auth\//;

  /* The one 403 that means the session is finished rather than "you are not
     allowed to do this". Future authorization refusals will use 403 too, so
     they are matched on this explicit code and nothing else - a bare 403
     must never log anyone out. */
  const SESSION_ENDED_CODE = "ACCOUNT_INACTIVE";

  class ApiError extends Error {
    constructor(details) {
      super(details.message || "The request failed");
      this.name = "ApiError";
      this.status = details.status || 0;
      this.success = false;
      this.data = details.data;
      this.errors = details.errors;
      this.dependencies = details.dependencies;
      this.errorCode = details.errorCode;
      this.network = Boolean(details.network);
      this.payload = details.payload;
    }
  }

  function normalizedPath(path) {
    return path.startsWith("/") ? path : "/" + path;
  }

  function buildUrl(path, queryParams) {
    const url = new URL(API_BASE_URL + normalizedPath(path));

    if (queryParams && typeof queryParams === "object") {
      Object.entries(queryParams).forEach(function addQueryEntry(entry) {
        const key = entry[0];
        const value = entry[1];
        if (value === undefined || value === null || value === "") return;
        if (Array.isArray(value)) {
          value.forEach(function addArrayValue(item) {
            url.searchParams.append(key, String(item));
          });
        } else {
          url.searchParams.set(key, String(value));
        }
      });
    }
    return url.toString();
  }

  async function parseResponse(response) {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) return text;
    try {
      return JSON.parse(text);
    } catch (error) {
      return text;
    }
  }

  async function request(path, options) {
    const settings = options || {};
    const method = (settings.method || "GET").toUpperCase();
    const headers = new Headers(settings.headers || {});
    headers.set("Accept", "application/json");

    /* credentials:"include" makes the browser attach the Flask session
       cookie to these cross-origin calls. Without it the API would treat
       every request as anonymous, because the frontend and the backend are
       served from different ports and cookies are not sent cross-origin by
       default. Nothing about the session is readable from JavaScript - the
       cookie is HttpOnly - so this is the only place authentication state
       is carried. */
    const fetchOptions = { method: method, headers: headers, credentials: "include" };
    if (Object.prototype.hasOwnProperty.call(settings, "body")) {
      headers.set("Content-Type", "application/json");
      fetchOptions.body = JSON.stringify(settings.body);
    }
    if (settings.signal) fetchOptions.signal = settings.signal;

    let response;
    try {
      response = await fetch(buildUrl(path, settings.queryParams), fetchOptions);
    } catch (error) {
      throw new ApiError({
        status: 0,
        message: "Could not reach the AquaFleet API",
        network: true
      });
    }

    const payload = await parseResponse(response);
    const objectPayload = payload && typeof payload === "object" ? payload : {};
    const result = {
      status: response.status,
      success: response.ok && objectPayload.success !== false,
      message: objectPayload.message || (response.ok ? "Request successful" : "Request failed"),
      data: objectPayload.data,
      errors: objectPayload.errors,
      dependencies: objectPayload.dependencies,
      errorCode: objectPayload.error_code,
      payload: payload
    };

    /* Authentication is gone: either no valid session (401) or the account
       behind it has been deactivated (403 + ACCOUNT_INACTIVE). Notify, then
       fall through to the normal ApiError throw so callers keep their
       existing 400 / 403 / 404 / 409 / 500 handling untouched. */
    const authenticationLost =
      response.status === 401
      || (response.status === 403 && objectPayload.error_code === SESSION_ENDED_CODE);

    if (authenticationLost
        && !AUTH_PATH_PATTERN.test(normalizedPath(path))
        && unauthorizedHandler) {
      try {
        unauthorizedHandler(response.status === 403 ? "inactive" : "unauthenticated");
      } catch (handlerError) {
        /* A failing handler must not replace the API error the caller is
           waiting for. */
      }
    }

    if (!response.ok) throw new ApiError(result);
    return result;
  }

  global.AquaFleetApi = Object.freeze({
    API_BASE_URL: API_BASE_URL,
    ApiError: ApiError,
    buildUrl: buildUrl,
    request: request,
    /* auth.js calls this during boot so a 401 on any protected endpoint
       returns the SPA to the login screen. */
    setUnauthorizedHandler: function setUnauthorizedHandler(handler) {
      unauthorizedHandler = typeof handler === "function" ? handler : null;
    },
    get: function get(path, queryParams) {
      return request(path, { method: "GET", queryParams: queryParams });
    },
    post: function post(path, body) {
      return request(path, { method: "POST", body: body });
    },
    put: function put(path, body) {
      return request(path, { method: "PUT", body: body });
    },
    del: function del(path, queryParams) {
      return request(path, { method: "DELETE", queryParams: queryParams });
    }
  });
})(window);
