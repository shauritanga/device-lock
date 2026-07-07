# R8 / ProGuard rules for the Device Lock agent (release builds are minified).
#
# Components declared in the manifest (activities, receivers, the FCM service,
# the device-admin receiver) are kept automatically by AGP. WorkManager and
# Firebase ship their own consumer rules. The keeps below are belt-and-suspenders
# for the reflection-instantiated pieces and the device-admin entry point.

# WorkManager instantiates workers reflectively via their (Context, WorkerParameters) ctor.
-keep class * extends androidx.work.ListenableWorker {
    <init>(android.content.Context, androidx.work.WorkerParameters);
}

# DeviceAdminReceiver is bound by the platform by name.
-keep class com.devicelock.agent.LockAdminReceiver { *; }

# FCM service is referenced from the manifest; keep its callbacks explicit too.
-keep class com.devicelock.agent.AgentMessagingService { *; }

# org.json is part of the platform; nothing to keep, but don't warn on it.
-dontwarn org.json.**
