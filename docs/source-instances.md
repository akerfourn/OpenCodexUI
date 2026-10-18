# Codex source instances

Home's source list distinguishes executable detection from the app-server
process owned by OpenCodexUI. Each source shows stopped, starting, running,
stopping or error state. The indicator pulses while work requests, agent turns,
approval prompts or spawned background processes are active. Reduced-motion
preferences disable the animation.

Passive metadata reads, such as account quotas, models and chat status, do not
make a source busy or require forced interruption. Commands or approval prompts
can still keep a source busy even when no chat is generating a response.
Native completion and idle events take precedence over delayed status replies.

Reading instance status never starts Codex. Other features can start a source
on demand, including account reads when opening Home. There is no idle timeout.
An instance stopped explicitly stays suspended for this application session:
background reads cannot launch it again. Use its Start button to resume it.

Stop and Restart operate on the owned instance for that source. Confirmation
explains that its ongoing work across chats can be interrupted. An active or
still-starting instance requires the force checkbox. A request rejected because
work started meanwhile stays open; it is never retried with force automatically.
Idle instances show no interruption warning or force checkbox. When busy, the
dialog explains the detected activity with request method names and counts of
turns, native active threads, approvals and processes. These details update
even while the instance stays busy; request arguments and chat content are
never included. These reasons describe the client's observed state and can
help identify a genuinely blocked operation or stale native state.

Shutdown first closes the instance's input. If it does not exit, OpenCodexUI
terminates its owned process (and its launcher tree on Windows). Restart waits
for confirmed exit before creating a replacement. Failed shutdown remains an
error rather than being reported as stopped. Interrupted commands can have
partial effects; inspect the workspace before retrying them. Recorded history
is preserved and stale approval prompts are dismissed.

These controls do not manage other applications' Codex instances, nor separate
temporary clients such as dictation sessions. The suspended state is not saved
across application restarts.
