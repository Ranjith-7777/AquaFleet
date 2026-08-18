/* Shared HTTP client for the AquaFleet Flask API. */
(function exposeAquaFleetApi(global) {
  "use strict";

  const API_BASE_URL = "http://127.0.0.1:5000";

  class ApiError extends Error {
    constructor(details) {
      super(details.message || "The request failed");
      this.name = "ApiError";
      this.status = details.status || 0;
      this.success = false;
      this.data = details.data;
      this.errors = details.errors;
      this.dependencies = details.dependencies;
      this.network = Boolean(details.network);
      this.payload = details.payload;
    }
  }

  function buildUrl(path, queryParams) {
    const normalizedPath = path.startsWith("/") ? path : "/" + path;
    const url = new URL(API_BASE_URL + normalizedPath);

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

    const fetchOptions = { method: method, headers: headers };
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
      payload: payload
    };

    if (!response.ok) throw new ApiError(result);
    return result;
  }

  global.AquaFleetApi = Object.freeze({
    API_BASE_URL: API_BASE_URL,
    ApiError: ApiError,
    buildUrl: buildUrl,
    request: request,
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
