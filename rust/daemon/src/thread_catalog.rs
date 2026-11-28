use codex_rpc::CallAdaptation;
use serde_json::{Map, Value, json};

/// Routes daemon-native catalog reads to the Codex adapter.
pub(crate) fn adapt_call(method: &str, params: Option<&Value>) -> CallAdaptation {
    if method != "opencodex/threads/list" {
        return CallAdaptation::PassThrough;
    }
    match codex_filters(params) {
        Ok(params) => CallAdaptation::Translate {
            method: "thread/list",
            params,
            map_result: thread_page,
        },
        Err(message) => CallAdaptation::Reject(json!({ "code": -32602, "message": message })),
    }
}

/// Translates one local catalog query without normalizing source paths or cursor values.
fn codex_filters(params: Option<&Value>) -> Result<Value, &'static str> {
    let mut filters = Map::new();
    let Some(params) = params else {
        return Ok(Value::Object(filters));
    };
    let input = params
        .as_object()
        .ok_or("Thread list params must be an object.")?;
    for (key, value) in input {
        let (name, mapped) = match key.as_str() {
            "pageSize" => ("limit", value.clone()),
            "sortBy" => ("sortKey", codex_sort_key(value)?),
            "workingDirectories" => ("cwd", codex_directories(value)?),
            "cursor" | "sortDirection" | "sourceKinds" | "searchTerm" | "archived"
            | "parentThreadId" | "ancestorThreadId" => (key.as_str(), value.clone()),
            _ => return Err("Unknown thread list filter."),
        };
        filters.insert(name.to_owned(), mapped);
    }
    Ok(Value::Object(filters))
}

/// Maps the local timestamp sort keys to Codex's wire names.
fn codex_sort_key(value: &Value) -> Result<Value, &'static str> {
    match value.as_str() {
        Some("createdAt") => Ok(json!("created_at")),
        Some("updatedAt") => Ok(json!("updated_at")),
        None if value.is_null() => Ok(Value::Null),
        _ => Err("Unknown thread list sort key."),
    }
}

/// Keeps singleton and multiple directory filters compatible with the Codex API.
fn codex_directories(value: &Value) -> Result<Value, &'static str> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    let directories = value
        .as_array()
        .ok_or("Working directories must be an array.")?;
    if !directories.iter().all(Value::is_string) {
        return Err("Working directories must contain only paths.");
    }
    match directories.as_slice() {
        [directory] => Ok(directory.clone()),
        _ => Ok(value.clone()),
    }
}

/// Projects Codex rows to the local catalog contract and preserves opaque cursors.
fn thread_page(value: Value) -> Value {
    let threads = value["data"]
        .as_array()
        .map(|rows| rows.iter().map(thread_summary).collect::<Vec<_>>())
        .unwrap_or_default();
    json!({
        "threads": threads,
        "nextCursor": nonempty_string(&value["nextCursor"]),
        "backwardsCursor": nonempty_string(&value["backwardsCursor"]),
    })
}

/// Maps one Codex row without applying UI formatting or cache metadata.
fn thread_summary(thread: &Value) -> Value {
    let sub_agent = sub_agent_source(&thread["source"]);
    json!({
        "id": thread["id"].as_str().unwrap_or_default(),
        "sessionId": nonempty_string(&thread["sessionId"]),
        "parentThreadId": nonempty_string(&thread["parentThreadId"])
            .or_else(|| nonempty_string(&sub_agent["parentThreadId"])),
        "codexTitle": thread["name"].as_str().unwrap_or_default(),
        "preview": thread["preview"].as_str().unwrap_or_default(),
        "projectPath": nonempty_string(&thread["cwd"]),
        "branchName": nonempty_string(&thread["gitInfo"]["branch"]),
        "updatedAtUnixSeconds": thread["updatedAt"].as_number(),
        "threadSource": nonempty_string(&thread["threadSource"]),
        "agentNickname": nonempty_string(&thread["agentNickname"])
            .or_else(|| nonempty_string(&sub_agent["agentNickname"])),
        "agentRole": nonempty_string(&thread["agentRole"])
            .or_else(|| nonempty_string(&sub_agent["agentRole"])),
        "subAgentSource": sub_agent,
        "canAcceptDirectInput": thread["canAcceptDirectInput"].as_bool(),
        "status": nonempty_string(&thread["status"]).or_else(|| nonempty_string(&thread["status"]["type"])),
    })
}

/// Reads both spellings used by Codex for sub-agent metadata.
fn sub_agent_source(source: &Value) -> Value {
    let agent = coalesce(&source["subagent"], &source["subAgent"]);
    let spawn = coalesce(&agent["thread_spawn"], &agent["threadSpawn"]);
    if spawn.as_object().is_some_and(|fields| !fields.is_empty()) {
        return json!({
            "kind": "threadSpawn",
            "parentThreadId": nonempty_string(coalesce(&spawn["parent_thread_id"], &spawn["parentThreadId"])),
            "depth": spawn["depth"].as_f64()
                .filter(|depth| (0.0..=9_007_199_254_740_991.0).contains(depth) && depth.fract() == 0.0)
                .map(|depth| depth as u64),
            "agentPath": nonempty_string(coalesce(&spawn["agent_path"], &spawn["agentPath"])),
            "agentNickname": nonempty_string(coalesce(&spawn["agent_nickname"], &spawn["agentNickname"])),
            "agentRole": nonempty_string(coalesce(&spawn["agent_role"], &spawn["agentRole"])),
            "label": null,
        });
    }
    let (kind, label) = match agent.as_str() {
        Some("review") => ("review", None),
        Some("compact") => ("compact", None),
        Some("memory_consolidation") => ("memoryConsolidation", None),
        _ => match nonempty_string(&agent["other"]) {
            Some(label) => ("other", Some(label)),
            None => return Value::Null,
        },
    };
    json!({
        "kind": kind, "parentThreadId": null, "depth": null, "agentPath": null,
        "agentNickname": null, "agentRole": null, "label": label,
    })
}

/// Uses the alternate spelling only when the first value is absent or null.
fn coalesce<'a>(first: &'a Value, alternate: &'a Value) -> &'a Value {
    if first.is_null() { alternate } else { first }
}

/// Treats empty metadata strings as missing without trimming user text or paths.
fn nonempty_string(value: &Value) -> Option<&str> {
    value.as_str().filter(|value| !value.is_empty())
}
