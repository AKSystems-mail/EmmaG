// Location: android/app/build.gradle.kts

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

// +++ ADDED: Import for the Properties class +++
import java.util.Properties

// +++ ADDED: This block reads properties from local.properties,
// including the ones needed by Flutter. +++
val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localProperties.load(localPropertiesFile.reader(Charsets.UTF_8))
}

// +++ ADDED: This block reads properties from key.properties for signing. +++
val keyProperties = Properties()
val keyPropertiesFile = rootProject.file("key.properties")
if (keyPropertiesFile.exists()) {
    keyProperties.load(keyPropertiesFile.reader(Charsets.UTF_8))
}

// +++ ADDED: Define Flutter properties at the top. +++
val flutterVersionCode = localProperties.getProperty("flutter.versionCode") ?: "1"
val flutterVersionName = localProperties.getProperty("flutter.versionName") ?: "1.1"

android {
    namespace = "com.emma_g_adv.app"
    // Use a fixed, stable SDK version. The flutter.* properties can be unreliable here.
    compileSdk = 35
    ndkVersion = "27.0.12077973"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    // +++ ADDED: The signingConfigs block at the correct level. +++
    signingConfigs {
        create("release") {
            keyAlias = keyProperties["keyAlias"] as String?
            keyPassword = keyProperties["keyPassword"] as String?
            storeFile = if (keyProperties["storeFile"] != null) rootProject.file(keyProperties["storeFile"] as String) else null
            storePassword = keyProperties["storePassword"] as String?
        }
    } // <-- The missing closing brace was here.

    defaultConfig {
        applicationId = "com.emma_g_adv.app"
        minSdk = 23
        targetSdk = 35 // Should match compileSdk
        versionCode = flutterVersionCode.toInt()
        versionName = flutterVersionName
        // Multidex is required for Firebase.
        multiDexEnabled = true
    }

    buildTypes {
        release {
            // This now correctly points to the signingConfig defined above.
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}

// +++ ADDED: The Firebase dependencies block was missing. +++
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.2.0"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-auth")
    // Add any other firebase dependencies you need
}