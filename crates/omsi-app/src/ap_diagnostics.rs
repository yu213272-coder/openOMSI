use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

struct Trace {
    file: Option<File>,
    channels: HashMap<&'static str, (String, Instant)>,
    every_frame: bool,
}

pub(crate) fn record(channel: &'static str, state: String, details: String, urgent: bool) {
    static TRACE: OnceLock<Mutex<Trace>> = OnceLock::new();
    let trace = TRACE.get_or_init(|| {
        let path = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.join("faraway-autopilot.log")));
        let file = path.as_ref().and_then(|p| match OpenOptions::new().create(true).append(true).open(p) {
            Ok(mut f) => {
                let _ = writeln!(f, "\n=== AP diagnostic session; build {} ===", env!("CARGO_PKG_VERSION"));
                Some(f)
            }
            Err(e) => { log::error!("[AP] cannot create diagnostic log: {e}"); None }
        });
        Mutex::new(Trace { file, channels: HashMap::new(), every_frame: std::env::var("FARAWAY_AP_TRACE_EVERY_FRAME").is_ok_and(|v| v == "1") })
    });
    let mut trace = trace.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if !trace.every_frame && !urgent && trace.channels.get(channel).is_some_and(|(s, t)| s == &state && now.duration_since(*t) < Duration::from_millis(250)) {
        return;
    }
    trace.channels.insert(channel, (state, now));
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs_f64();
    let line = format!("{timestamp:.3} [{channel}] {details}");
    log::info!("[AP] {line}");
    if let Some(f) = trace.file.as_mut() {
        if let Err(e) = writeln!(f, "{line}").and_then(|_| f.flush()) {
            log::error!("[AP] writing diagnostic log failed: {e}");
            trace.file = None;
        }
    }
}

pub(crate) fn vehicle(v: &omsi_sim::VehicleInstance) -> String {
    let names = ["ap_enabled", "ap_fault", "ap_state", "ap_bridge_valid", "ap_nav_reason", "ap_fault_reason", "ap_button", "ap_throttle", "ap_brake", "ap_steer", "ap_stop_distance", "ap_stop_id", "ap_served_id", "ap_nav_speed", "ap_target_speed", "ap_timer", "ap_terminal", "AI", "Velocity", "Throttle", "Brake", "elec_busbar_main", "engine_on", "engine_n", "antrieb_getr_aktugang", "bremse_feststell_sw", "bremse_halte_sw", "door_0", "door_1", "door_2", "door_3", "doorTarget_0", "doorTarget_1", "doorTarget_23", "M_Wheel", "Axle_Brakeforce_0_L", "Axle_Brakeforce_0_R"];
    names.iter().map(|n| format!("{n}={:?}", v.var(n))).collect::<Vec<_>>().join(" ")
}
