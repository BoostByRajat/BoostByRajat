# BBR Invoice — Android

The phone app is a Capacitor WebView of the live invoice desk:

`https://www.boostbyrajat.co.in/invoice.html`

Billing stays on the website. Deploy invoice changes there before they show in the app. Login is the same username and password; the session cookie belongs to that site.

Package id: `com.boostbyrajat.invoice`

## Debug APK

1. Install [Android Studio](https://developer.android.com/studio) (SDK 36, JDK 21).
2. From the repo root:

```bash
npm install
npm run android:debug
```

`android:debug` syncs the Capacitor project, then runs `gradlew.bat assembleDebug`.

The APK is written to:

`android/app/build/outputs/apk/debug/app-debug.apk`

Install that file on a phone (allow installs from that source), or open the project in Android Studio with `npx cap open android` and press Run.

## Play Store

The listing is created in your Google Play Console account (one-time developer fee). This repo does not create that account.

1. In Android Studio, build a signed App Bundle (AAB), and keep the upload keystore.
2. Create the app in Play Console with package `com.boostbyrajat.invoice`.
3. Add the privacy policy URL: `https://www.boostbyrajat.co.in/legal/privacy.html`
4. Upload screenshots, the AAB, and submit for review.

The app only works online, because it opens the live desk.
