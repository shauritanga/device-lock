plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

import java.util.Properties

// Enable FCM only when a Firebase config is supplied. Without google-services.json
// the app still builds and runs — it just falls back to periodic check-ins.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Release signing (optional locally). Create android-dpc/keystore.properties from
// keystore.properties.example — never commit the real file or the .jks.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

android {
    namespace = "com.devicelock.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.devicelock.agent"
        minSdk = 24
        targetSdk = 34
        versionCode = 7
        versionName = "0.3.4"

        // Production API only — not overridable on-device. HTTPS only.
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

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            buildConfigField(
                "String",
                "AGENT_BASE_URL",
                "\"https://api.linda.co.tz/v1\"",
            )
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
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
