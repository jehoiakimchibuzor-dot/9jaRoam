$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location "C:\Users\User\AndroidStudioProjects\9ja-roam-3d\android"
& ./gradlew.bat :app:assembleDebug --console=plain --no-daemon --no-problems-report