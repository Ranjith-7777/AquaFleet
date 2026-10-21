/* Central client-side mirror of the backend RBAC policy.
   This controls presentation only; Flask remains the security boundary. */
(function exposeAquaFleetPermissions(global) {
  "use strict";

  const roles = Object.freeze(["ADMIN", "RESEARCHER", "OPERATOR", "VIEWER"]);
  const grants = {
    vessels: adminOnly(),
    "marine-zones": adminOnly(),
    vehicles: adminOnly(),
    operators: adminOnly(),
    sensors: adminOnly(),
    "battery-packs": adminOnly(),
    "offshore-assets": adminOnly(),
    expeditions: policy(["ADMIN", "RESEARCHER"], ["ADMIN", "RESEARCHER"], ["ADMIN"]),
    missions: policy(["ADMIN", "RESEARCHER"], ["ADMIN", "RESEARCHER", "OPERATOR"], ["ADMIN"]),
    "mission-vehicles": shared(["ADMIN", "RESEARCHER", "OPERATOR"]),
    "mission-operators": shared(["ADMIN", "RESEARCHER", "OPERATOR"]),
    "vehicle-sensors": shared(["ADMIN", "OPERATOR"]),
    "vehicle-batteries": shared(["ADMIN", "OPERATOR"]),
    "maintenance-records": shared(["ADMIN", "OPERATOR"]),
    "telemetry-points": shared(["ADMIN", "OPERATOR"]),
    incidents: shared(["ADMIN", "OPERATOR"]),
    "inspection-tasks": shared(["ADMIN", "OPERATOR"]),
    samples: policy(["ADMIN", "RESEARCHER"], ["ADMIN", "RESEARCHER"], ["ADMIN"]),
    "sample-aliquots": policy(["ADMIN", "RESEARCHER"], ["ADMIN", "RESEARCHER"], ["ADMIN"]),
    notifications: policy([], ["ADMIN", "RESEARCHER", "OPERATOR"], []),
    reports: policy([], [], [])
  };

  function policy(create, update, remove) {
    return Object.freeze({
      create: Object.freeze(create.slice()),
      update: Object.freeze(update.slice()),
      delete: Object.freeze(remove.slice())
    });
  }

  function shared(allowed) { return policy(allowed, allowed, allowed); }
  function adminOnly() { return shared(["ADMIN"]); }

  function currentRole() {
    const auth = global.AquaFleetAuth;
    const user = auth && auth.currentUser ? auth.currentUser() : null;
    return user ? user.role : null;
  }

  function can(resource, action, role) {
    const effectiveRole = role || currentRole();
    if (!roles.includes(effectiveRole)) return false;
    if (action === "read") return true;
    const resourcePolicy = grants[resource];
    return Boolean(resourcePolicy && resourcePolicy[action]
      && resourcePolicy[action].includes(effectiveRole));
  }

  global.AquaFleetPermissions = Object.freeze({
    roles: roles,
    grants: Object.freeze(grants),
    can: can,
    currentRole: currentRole
  });
})(window);
