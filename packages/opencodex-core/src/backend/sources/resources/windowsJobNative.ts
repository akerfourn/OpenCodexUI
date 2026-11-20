/**
 * Compiled in the Windows PowerShell host using the .NET framework already shipped with Windows.
 * The app-server starts suspended: it cannot create children before assignment to its Job Object.
 */
export const windowsJobNative = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class OpenCodexResourceJob {
    // Native layouts must retain pointer-sized fields on both x64 and ARM64 Windows.
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations;
        public ulong ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct CpuLimits { public uint Flags, Rate; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo {
        public uint Size;
        public string Reserved, Desktop, Title;
        public uint X, Y, Width, Height, CharsX, CharsY, Fill, Flags;
        public ushort ShowWindow, ReservedSize;
        public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref CpuLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory,
        ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess,
        out IntPtr target, uint access, bool inherit, uint options);

    /// Rejects OS failures before an unrestricted child can execute.
    private static void Require(bool result) {
        if (!result) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    /// Creates a group with an inherited priority ceiling, optional aggregate CPU cap and owned cleanup.
    private static IntPtr CreateGroup(uint priority, uint cpuRate) {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        Require(job != IntPtr.Zero);
        try {
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000 | 0x20; // KILL_ON_JOB_CLOSE | PRIORITY_CLASS; no breakaway.
            limits.Basic.PriorityClass = priority;
            Require(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)));
            if (cpuRate > 0) {
                CpuLimits cpu = new CpuLimits();
                cpu.Flags = 0x1 | 0x4; // ENABLE | HARD_CAP.
                cpu.Rate = cpuRate;
                Require(SetInformationJobObject(job, 15, ref cpu, (uint)Marshal.SizeOf(cpu)));
            }
            return job;
        } catch {
            CloseHandle(job);
            throw;
        }
    }

    /// Checks actual API and PowerShell permissions without starting any user command.
    public static void Probe() {
        CloseHandle(CreateGroup(0x4000, 100));
    }

    /// Duplicates only a standard stream as an inheritable handle for the suspended child.
    private static IntPtr InheritStream(int kind) {
        IntPtr result;
        IntPtr current = GetCurrentProcess();
        Require(DuplicateHandle(current, GetStdHandle(kind), current, out result, 0, true, 2));
        return result;
    }

    /// Forwards the original byte streams directly; PowerShell never interprets the JSON-RPC data.
    public static int Run(string commandLine, uint priority, uint cpuRate) {
        IntPtr job = CreateGroup(priority, cpuRate);
        ProcessInfo child = new ProcessInfo();
        StartupInfo startup = new StartupInfo();
        bool finished = false;
        try {
            startup.Size = (uint)Marshal.SizeOf(startup);
            startup.Flags = 0x100 | 0x1; // USESTDHANDLES | USESHOWWINDOW (hidden).
            startup.Input = InheritStream(-10);
            startup.Output = InheritStream(-11);
            startup.Error = InheritStream(-12);
            Require(CreateProcess(null, new StringBuilder(commandLine), IntPtr.Zero, IntPtr.Zero,
                true, 0x4 | 0x08000000 | priority, IntPtr.Zero, null, ref startup, out child));
            Require(AssignProcessToJobObject(job, child.Process));
            Require(ResumeThread(child.Thread) != 0xFFFFFFFF);
            Require(WaitForSingleObject(child.Process, 0xFFFFFFFF) == 0);
            uint code;
            Require(GetExitCodeProcess(child.Process, out code));
            finished = true;
            return unchecked((int)code);
        } finally {
            if (child.Process != IntPtr.Zero && !finished) TerminateProcess(child.Process, 1);
            CloseHandle(job); // Also releases descendants after EOF, failure or launcher termination.
            if (child.Thread != IntPtr.Zero) CloseHandle(child.Thread);
            if (child.Process != IntPtr.Zero) CloseHandle(child.Process);
            if (startup.Input != IntPtr.Zero) CloseHandle(startup.Input);
            if (startup.Output != IntPtr.Zero) CloseHandle(startup.Output);
            if (startup.Error != IntPtr.Zero) CloseHandle(startup.Error);
        }
    }
}
`;
