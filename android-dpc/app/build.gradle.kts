plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Enable FCM only when a Firebase config is supplied. Without google-services.json
// the app still builds and runs — it just falls back to periodic check-ins.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.devicelock.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.devicelock.agent"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1-poc"

        // Always point at production so debug APKs and enrolled devices share
        // one backend (easy fleet management while still developing). Not
        // overridable on-device. HTTPS only — no cleartext fallback.
        buildConfigField(
            "String",
            "AGENT_BASE_URL",
            "\"https://api.linda.co.tz/v1\"",
        )
        // Staff gate for the one-time enrollment screen. Override per-release;
        // a real deployment should inject this from a secret, not ship a default.
        buildConfigField("String", "STAFF_PIN", "\"2468\"")
        // Helpline shown and dialable from the lock screen. This is a support
        // line, NOT an emergency service number.
        buildConfigField("String", "SUPPORT_PHONE", "\"+255658216813\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Same production API as debug.
            buildConfigField(
                "String",
                "AGENT_BASE_URL",
                "\"https://api.linda.co.tz/v1\"",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")

    // Background command delivery: reliable periodic + expedited one-shot check-ins.
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // FCM instant-delivery path. The library links fine without google-services.json;
    // it stays inert at runtime until a Firebase config is added.
    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))
    implementation("com.google.firebase:firebase-messaging")

    // Keystore-backed encryption for the agent token at rest.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
