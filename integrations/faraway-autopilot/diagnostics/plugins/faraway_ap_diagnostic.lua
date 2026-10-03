local last = nil
local elapsed = 0

local names = {
    "ap_enabled", "ap_fault", "ap_state", "ap_bridge_valid", "ap_nav_reason", "ap_fault_reason", "ap_button",
    "ap_throttle", "ap_brake", "ap_steer", "ap_stop_distance", "ap_stop_id",
    "ap_nav_speed", "ap_target_speed", "ap_timer", "ap_terminal",
    "AI", "Velocity", "elec_busbar_main", "engine_on", "antrieb_getr_aktugang",
    "bremse_feststell_sw", "bremse_halte_sw", "Brake",
    "door_0", "door_1", "door_2", "door_3",
    "doorTarget_0", "doorTarget_1", "doorTarget_23"
}

local function fmt(value)
    if value == nil then return "missing" end
    return string.format("%.2f", value)
end

local function snapshot()
    local values = {}
    for _, name in ipairs(names) do values[name] = omsi.var(name) end
    local info = omsi.info()
    local reasons = {}
    local function require_value(name, predicate, label)
        if values[name] == nil then
            reasons[#reasons + 1] = name .. " missing"
        elseif not predicate(values[name]) then
            reasons[#reasons + 1] = label
        end
    end
    if info.multiplayer then reasons[#reasons + 1] = "MULTIPLAYER" end
    require_value("ap_bridge_valid", function(v) return v > 0.5 end, "NAV INVALID")
    require_value("AI", function(v) return v == 0 end, "AI owns bus")
    require_value("elec_busbar_main", function(v) return v ~= 0 end, "power off")
    require_value("engine_on", function(v) return v ~= 0 end, "engine off")
    require_value("antrieb_getr_aktugang", function(v) return v > 0 end, "not forward gear")
    require_value("bremse_feststell_sw", function(v) return v == 0 end, "parking brake")
    require_value("bremse_halte_sw", function(v) return v == 0 end, "stop brake")
    for i = 0, 3 do
        require_value("door_" .. i, function(v) return v < 0.05 end, "door " .. i .. " open")
    end
    for _, name in ipairs({"doorTarget_0", "doorTarget_1", "doorTarget_23"}) do
        require_value(name, function(v) return v == 0 end, name .. " requests open")
    end
    return values, reasons
end

local nav_reasons = {
    [0]="OK", [1]="multiplayer disabled", [2]="no timetable duty", [3]="trip complete",
    [4]="navigator missing", [5]="route flags/global invalid (see log)", [6]="route/duty key mismatch",
    [7]="empty route", [8]="no remaining stop", [9]="unknown stop position", [10]="bus projection failed",
    [11]="lane projection failed", [12]="lane 3D distance >2m", [13]="heading error >45deg",
    [14]="stop projection >12m/missing", [15]="stop behind bus", [16]="road gap >1.5m",
    [17]="target behind axle", [18]="invalid steering lock", [19]="non-finite navigation"
}
local fault_reasons = {
    [0]="none", [101]="DRIVER BRAKE", [102]="activation gate rejected",
    [103]="runtime gate failed", [104]="STOP OVERSHOT >2m", [105]="bus moved while opening doors",
    [106]="door/stop brake interlock"
}

-- Observe transitions every frame, including navigation that fails just after activation.
omsi.on("frame", function(dt)
    if not omsi.has_vehicle() then last = nil; return end
    local v, reasons = snapshot()
    local signature = table.concat({fmt(v.ap_enabled), fmt(v.ap_fault), fmt(v.ap_state), fmt(v.ap_bridge_valid), fmt(v.ap_nav_reason), fmt(v.ap_fault_reason), table.concat(reasons, ", ")}, " | ")
    if signature ~= last then
        last = signature
        local fields = {}
        for _, name in ipairs(names) do fields[#fields + 1] = name .. "=" .. fmt(v[name]) end
        omsi.log("AP diagnostic: " .. table.concat(fields, " ") .. " | current gates: " .. table.concat(reasons, ", "))
    end
    elapsed = elapsed + dt
    if elapsed < 1 then return end
    elapsed = elapsed % 1
    if v.ap_enabled == nil then
        omsi.message("AP diagnostic: autopilot variables MISSING (check vehicle script installation)", 1.5)
        return
    end
    local gate = reasons[1] or "gates OK"
    if v.ap_fault and v.ap_fault > 0.5 and #reasons == 0 then gate = "fault latched; cause may be earlier or driver brake" end
    if v.ap_nav_reason and v.ap_nav_reason ~= 0 then gate = "NAV " .. v.ap_nav_reason .. ": " .. (nav_reasons[v.ap_nav_reason] or "unknown")
    elseif v.ap_fault and v.ap_fault > 0.5 and v.ap_fault_reason and v.ap_fault_reason ~= 0 then gate = "FAULT " .. v.ap_fault_reason .. ": " .. (fault_reasons[v.ap_fault_reason] or "unknown") end
    omsi.message(string.format("AP on=%s fault=%s state=%s nav=%s | %s", fmt(v.ap_enabled), fmt(v.ap_fault), fmt(v.ap_state), fmt(v.ap_bridge_valid), gate), 1.5)
end)
