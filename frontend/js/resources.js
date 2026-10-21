/* Declarative table/detail configuration for every direct AquaFleet resource. */
(function exposeAquaFleetResources(global) {
  "use strict";

  function col(field, label, type, category, options) {
    return Object.assign({ field: field, label: label, type: type || "text", category: category }, options || {});
  }

  function resource(key, title, subtitle, keys, columns, details) {
    return { key: key, title: title, subtitle: subtitle, path: "/api/" + key, keys: keys, columns: columns, details: details };
  }

  const c = col;
  const resources = [
    resource("vessels", "Research Vessels", "Research vessel registry and operating capacity.", ["vessel_id"],
      [c("vessel_id","ID","number"),c("vessel_name","Vessel"),c("vessel_type","Type"),c("home_port","Home Port"),c("capacity","Capacity","number")],
      [c("vessel_id","Vessel ID","number"),c("vessel_name","Vessel Name"),c("vessel_type","Vessel Type"),c("home_port","Home Port"),c("capacity","Capacity","number")]),
    resource("marine-zones", "Marine Zones", "Survey regions, operating depths and risk classifications.", ["zone_id"],
      [c("zone_id","ID","number"),c("zone_name","Zone"),c("region","Region"),c("min_depth","Min Depth","number"),c("max_depth","Max Depth","number"),c("risk_level","Risk","badge","priority")],
      [c("zone_id","Zone ID","number"),c("zone_name","Zone Name"),c("region","Region"),c("min_depth","Minimum Depth","number"),c("max_depth","Maximum Depth","number"),c("risk_level","Risk Level","badge","priority")]),
    resource("vehicles", "AUV/ROV Vehicles", "Autonomous and remotely operated vehicle fleet.", ["vehicle_id"],
      [c("vehicle_id","ID","number"),c("vehicle_name","Vehicle"),c("vehicle_type","Type"),c("model","Model"),c("max_depth","Max Depth","number"),c("status","Status","badge","vehicle")],
      [c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle Name"),c("vehicle_type","Vehicle Type"),c("model","Model"),c("max_depth","Maximum Depth","number"),c("status","Status","badge","vehicle")]),
    resource("operators", "Operators", "Personnel, qualifications and contact information.", ["operator_id"],
      [c("operator_id","ID","number"),c("first_name","First Name"),c("last_name","Last Name"),c("role","Role"),c("certification_level","Certification")],
      [c("operator_id","Operator ID","number"),c("first_name","First Name"),c("last_name","Last Name"),c("role","Role"),c("certification_level","Certification Level"),c("email","Email"),c("contact_numbers","Contact Numbers","list")]),
    resource("sensors", "Sensors", "Scientific sensor inventory and calibration details.", ["sensor_id"],
      [c("sensor_id","ID","number"),c("sensor_type","Sensor"),c("manufacturer","Manufacturer"),c("calibration_date","Calibrated","date"),c("accuracy","Accuracy","number")],
      [c("sensor_id","Sensor ID","number"),c("sensor_type","Sensor Type"),c("manufacturer","Manufacturer"),c("calibration_date","Calibration Date","date"),c("accuracy","Accuracy","number")]),
    resource("battery-packs", "Battery Packs", "Battery capacity, chemistry, condition and lifecycle.", ["battery_id"],
      [c("battery_id","ID","number"),c("chemistry","Chemistry"),c("capacity_wh","Capacity (Wh)","number"),c("health_status","Health","badge","battery"),c("cycle_count","Cycles","number")],
      [c("battery_id","Battery ID","number"),c("chemistry","Chemistry"),c("capacity_wh","Capacity (Wh)","number"),c("health_status","Health Status","badge","battery"),c("cycle_count","Cycle Count","number")]),
    resource("offshore-assets", "Offshore Assets", "Offshore infrastructure targeted by inspections.", ["asset_id"],
      [c("asset_id","ID","number"),c("asset_name","Asset"),c("asset_type","Type"),c("latitude","Latitude","number"),c("longitude","Longitude","number")],
      [c("asset_id","Asset ID","number"),c("asset_name","Asset Name"),c("asset_type","Asset Type"),c("latitude","Latitude","number"),c("longitude","Longitude","number")]),
    resource("expeditions", "Expeditions", "Research campaigns, vessels, dates, budgets and mission totals.", ["expedition_id"],
      [c("expedition_id","ID","number"),c("title","Expedition"),c("vessel_name","Vessel"),c("start_date","Start","date"),c("end_date","End","date"),c("status","Status","badge","expedition"),c("mission_count","Missions","number")],
      [c("expedition_id","Expedition ID","number"),c("title","Title"),c("vessel_id","Vessel ID","number"),c("vessel_name","Vessel Name"),c("home_port","Home Port"),c("start_date","Start Date","date"),c("end_date","End Date","date"),c("objective","Objective","text",null,{long:true}),c("status","Status","badge","expedition"),c("budget","Budget","number"),c("mission_count","Mission Count","number")]),
    resource("missions", "Missions", "Mission plans, parent expeditions, zones and execution status.", ["mission_id"],
      [c("mission_id","ID","number"),c("mission_type","Mission"),c("expedition_title","Expedition"),c("zone_name","Zone"),c("start_time","Start","datetime"),c("status","Status","badge","mission")],
      [c("mission_id","Mission ID","number"),c("mission_type","Mission Type"),c("expedition_id","Expedition ID","number"),c("expedition_title","Expedition"),c("zone_id","Zone ID","number"),c("zone_name","Zone"),c("region","Region"),c("start_time","Start Time","datetime"),c("end_time","End Time","datetime"),c("duration_minutes","Duration (minutes)","number"),c("depth_target","Depth Target","number"),c("status","Status","badge","mission")]),
    resource("mission-vehicles", "Mission Vehicles", "Vehicle deployment periods assigned to missions.", ["mission_id","vehicle_id"],
      [c("mission_id","Mission ID","number"),c("mission_type","Mission"),c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle"),c("launch_time","Launch","datetime"),c("recovery_time","Recovery","datetime")],
      [c("mission_id","Mission ID","number"),c("mission_type","Mission Type"),c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle Name"),c("vehicle_type","Vehicle Type"),c("launch_time","Launch Time","datetime"),c("recovery_time","Recovery Time","datetime")]),
    resource("mission-operators", "Mission Operators", "Operator duties and shifts assigned to missions.", ["mission_id","operator_id"],
      [c("mission_id","Mission ID","number"),c("mission_type","Mission"),c("operator_id","Operator ID","number"),c("operator_name","Operator"),c("duty_role","Duty Role"),c("shift","Shift")],
      [c("mission_id","Mission ID","number"),c("mission_type","Mission Type"),c("operator_id","Operator ID","number"),c("operator_name","Operator Name"),c("duty_role","Duty Role"),c("shift","Shift")]),
    resource("vehicle-sensors", "Vehicle Sensors", "Sensor installations and mounting positions by vehicle.", ["vehicle_id","sensor_id"],
      [c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle"),c("sensor_id","Sensor ID","number"),c("sensor_type","Sensor"),c("mount_position","Mount"),c("install_date","Installed","date")],
      [c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle Name"),c("sensor_id","Sensor ID","number"),c("sensor_type","Sensor Type"),c("manufacturer","Manufacturer"),c("mount_position","Mount Position"),c("install_date","Install Date","date")]),
    resource("vehicle-batteries", "Vehicle Batteries", "Non-overlapping battery assignment periods.", ["vehicle_id","battery_id","start_cycle"],
      [c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle"),c("battery_id","Battery ID","number"),c("chemistry","Chemistry"),c("start_cycle","Start Cycle","datetime"),c("end_cycle","End Cycle","datetime")],
      [c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle Name"),c("battery_id","Battery ID","number"),c("chemistry","Chemistry"),c("capacity_wh","Capacity (Wh)","number"),c("start_cycle","Start Cycle","datetime"),c("end_cycle","End Cycle","datetime")]),
    resource("maintenance-records", "Maintenance Records", "Vehicle maintenance history, costs and due dates.", ["maintenance_id"],
      [c("maintenance_id","ID","number"),c("vehicle_name","Vehicle"),c("maint_date","Date","date"),c("action_taken","Action","text",null,{truncate:true}),c("cost","Cost","number"),c("next_due_date","Next Due","date")],
      [c("maintenance_id","Maintenance ID","number"),c("vehicle_id","Vehicle ID","number"),c("vehicle_name","Vehicle Name"),c("vehicle_type","Vehicle Type"),c("vehicle_status","Vehicle Status","badge","vehicle"),c("maint_date","Maintenance Date","date"),c("action_taken","Action Taken","text",null,{long:true}),c("cost","Cost","number"),c("next_due_date","Next Due Date","date")]),
    resource("telemetry-points", "Telemetry Points", "Mission telemetry positions, depth, power and temperature.", ["mission_id","log_no"],
      [c("mission_id","Mission ID","number"),c("log_no","Log No.","number"),c("timestamp","Timestamp","datetime"),c("depth","Depth","number"),c("battery_level","Battery %","number"),c("temperature","Temperature","number")],
      [c("mission_id","Mission ID","number"),c("log_no","Log Number","number"),c("mission_type","Mission Type"),c("mission_status","Mission Status","badge","mission"),c("start_time","Mission Start","datetime"),c("end_time","Mission End","datetime"),c("timestamp","Timestamp","datetime"),c("latitude","Latitude","number"),c("longitude","Longitude","number"),c("depth","Depth","number"),c("depth_target","Depth Target","number"),c("battery_level","Battery Level (%)","number"),c("temperature","Temperature","number")]),
    resource("samples", "Samples", "Marine sample lineage, preservation and custody state.", ["sample_id"],
      [c("sample_id","ID","number"),c("sample_type","Sample"),c("mission_type","Mission"),c("collected_at","Collected","datetime"),c("chain_of_custody_status","Custody","badge","custody"),c("aliquot_count","Aliquots","number")],
      [c("sample_id","Sample ID","number"),c("mission_id","Mission ID","number"),c("mission_type","Mission Type"),c("mission_status","Mission Status","badge","mission"),c("start_time","Mission Start","datetime"),c("end_time","Mission End","datetime"),c("sample_type","Sample Type"),c("collected_at","Collected At","datetime"),c("preservation_method","Preservation Method"),c("chain_of_custody_status","Custody Status","badge","custody"),c("aliquot_count","Aliquot Count","number")]),
    resource("sample-aliquots", "Sample Aliquots", "Sub-portions and storage conditions for collected samples.", ["sample_id","aliquot_no"],
      [c("sample_id","Sample ID","number"),c("aliquot_no","Aliquot No.","number"),c("sample_type","Sample"),c("volume_ml","Volume (ml)","number"),c("storage_temp","Storage Temp","number"),c("chain_of_custody_status","Custody","badge","custody")],
      [c("sample_id","Sample ID","number"),c("aliquot_no","Aliquot Number","number"),c("mission_id","Mission ID","number"),c("sample_type","Sample Type"),c("preservation_method","Preservation Method"),c("chain_of_custody_status","Custody Status","badge","custody"),c("volume_ml","Volume (ml)","number"),c("storage_temp","Storage Temperature","number")]),
    resource("incidents", "Incidents", "Mission incidents, severity and full reports.", ["incident_id"],
      [c("incident_id","ID","number"),c("incident_type","Incident"),c("mission_type","Mission"),c("severity","Severity","badge","severity"),c("time_reported","Reported","datetime"),c("description","Description","text",null,{truncate:true})],
      [c("incident_id","Incident ID","number"),c("mission_id","Mission ID","number"),c("mission_type","Mission Type"),c("mission_status","Mission Status","badge","mission"),c("start_time","Mission Start","datetime"),c("end_time","Mission End","datetime"),c("incident_type","Incident Type"),c("severity","Severity","badge","severity"),c("time_reported","Time Reported","datetime"),c("description","Description","text",null,{long:true})]),
    resource("inspection-tasks", "Inspection Tasks", "Offshore inspection workflow, priority and findings.", ["inspection_id"],
      [c("inspection_id","ID","number"),c("task_type","Task"),c("asset_name","Asset"),c("mission_type","Mission"),c("priority","Priority","badge","priority"),c("status","Status","badge","inspection")],
      [c("inspection_id","Inspection ID","number"),c("mission_id","Mission ID","number"),c("mission_type","Mission Type"),c("mission_status","Mission Status","badge","mission"),c("mission_start_time","Mission Start","datetime"),c("mission_end_time","Mission End","datetime"),c("asset_id","Asset ID","number"),c("asset_name","Asset Name"),c("asset_type","Asset Type"),c("asset_latitude","Asset Latitude","number"),c("asset_longitude","Asset Longitude","number"),c("task_type","Task Type"),c("priority","Priority","badge","priority"),c("status","Status","badge","inspection"),c("finding_summary","Finding Summary","text",null,{long:true})])
  ];

  const byKey = Object.freeze(Object.fromEntries(resources.map(function mapResource(item) { return [item.key, item]; })));
  global.AquaFleetResources = Object.freeze({ all: Object.freeze(resources), byKey: byKey });
})(window);
