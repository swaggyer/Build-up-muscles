package com.swaggyer.baojiboji;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** Runs the bundled website and uses Android's camera/document apps for photos. */
public final class MainActivity extends Activity {
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + LOCAL_HOST + "/assets/web/index.html";
    private static final int PICK_PHOTO = 4001;
    private static final int TAKE_PHOTO = 4002;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private AppUpdateManager appUpdater;
    private final Map<String, JavaScriptReplyProxy> updateReplies = new HashMap<>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        clearOldCameraFiles();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246, 244, 237));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        webView.setBackgroundColor(Color.rgb(246, 244, 237));
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        installUpdateBridge();

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serveBundledAsset(loader, request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return routeNavigation(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeNavigation(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                finishFileChoice(null);
                fileCallback = callback;
                // The mobile website uses an image input with capture="environment" for its camera button.
                if (params.isCaptureEnabled()) launchCamera();
                else launchPhotoPicker(params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Photo capture is delegated to the system camera, so this app needs no CAMERA permission.
                // Never grant microphone or website permission requests implicitly.
                request.deny();
            }
        });

        if (state == null || webView.restoreState(state) == null) webView.loadUrl(START_URL);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void installUpdateBridge() {
        appUpdater = new AppUpdateManager(this, message -> runOnUiThread(() -> {
            String id = message.optString("id", "");
            JavaScriptReplyProxy reply = updateReplies.get(id);
            if (reply == null || webView == null) return;
            try {
                reply.postMessage(message.toString());
            } catch (IllegalStateException ignored) {
                updateReplies.remove(id);
            }
            String type = message.optString("type", "");
            if ("result".equals(type) || "error".equals(type)) updateReplies.remove(id);
        }));
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(webView, "BaojiUpdater",
                Collections.singleton("https://" + LOCAL_HOST), (view, message, origin, isMainFrame, reply) -> {
                    if (!isMainFrame || !"https".equalsIgnoreCase(origin.getScheme())
                            || !LOCAL_HOST.equalsIgnoreCase(origin.getHost())
                            || (origin.getPort() != -1 && origin.getPort() != 443)) return;
                    String raw = message.getData();
                    if (raw == null || raw.length() > 4096) return;
                    try {
                        JSONObject request = new JSONObject(raw);
                        String id = request.optString("id", "");
                        String action = request.optString("action", "");
                        if (!id.matches("[A-Za-z0-9._:-]{1,96}")) return;
                        if (!("check".equals(action) || "download".equals(action)
                                || "openInstall".equals(action) || "settings".equals(action))) {
                            bridgeError(reply, id, action, "unsupported_action", "不支持此更新操作。");
                            return;
                        }
                        if (updateReplies.containsKey(id) || updateReplies.size() >= 32) {
                            bridgeError(reply, id, action, "request_busy", "更新操作正在进行，请稍后重试。");
                            return;
                        }
                        updateReplies.put(id, reply);
                        appUpdater.handle(id, action, request);
                    } catch (JSONException error) {
                        // Only bounded JSON messages from the bundled main document reach the native updater.
                    }
                });
    }

    private void bridgeError(JavaScriptReplyProxy reply, String id, String action, String code, String text) {
        try {
            JSONObject message = new JSONObject();
            message.put("id", id).put("action", action).put("type", "error").put("ok", false)
                    .put("code", code).put("message", text);
            reply.postMessage(message.toString());
        } catch (JSONException | IllegalStateException ignored) {
            // The requesting document may have been closed already.
        }
    }

    private WebResourceResponse serveBundledAsset(WebViewAssetLoader loader, Uri uri) {
        WebResourceResponse response = loader.shouldInterceptRequest(uri);
        if (response == null || uri.getPath() == null) return response;
        // Android's extension table may classify .mjs as text/plain. ES module imports require JS MIME.
        String path = uri.getPath().toLowerCase(Locale.ROOT);
        if (path.endsWith(".js") || path.endsWith(".mjs")) {
            response.setMimeType("application/javascript");
            response.setEncoding("UTF-8");
        } else if (path.endsWith(".wasm")) {
            response.setMimeType("application/wasm");
            response.setEncoding(null);
        } else if (path.endsWith(".onnx")) {
            response.setMimeType("application/octet-stream");
            response.setEncoding(null);
        } else if (path.endsWith(".json")) {
            response.setMimeType("application/json");
            response.setEncoding("UTF-8");
        }
        return response;
    }

    private boolean routeNavigation(Uri uri) {
        boolean local = "https".equalsIgnoreCase(uri.getScheme())
                && LOCAL_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null && uri.getPath().startsWith("/assets/web/");
        if (local) return false;
        if ("https".equalsIgnoreCase(uri.getScheme())) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (ActivityNotFoundException error) {
                toast("请先安装可打开网页的浏览器。");
            }
        } else toast("仅支持打开安全网页链接。");
        return true;
    }

    private void launchPhotoPicker(boolean multiple) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intent, PICK_PHOTO);
        } catch (ActivityNotFoundException error) {
            toast("这台设备暂时没有可用的照片选择器。");
            finishFileChoice(null);
        }
    }

    private void launchCamera() {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(getPackageManager()) == null) {
            toast("这台设备暂时没有可用的相机，请从相册选择。");
            launchPhotoPicker(false);
            return;
        }
        try {
            File folder = new File(getCacheDir(), "meal-photos");
            if (!folder.exists() && !folder.mkdirs()) throw new IOException("Unable to create photo cache");
            File photo = File.createTempFile("meal-", ".jpg", folder);
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            intent.setClipData(ClipData.newRawUri("餐食照片", cameraUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(intent, TAKE_PHOTO);
        } catch (IOException | ActivityNotFoundException | SecurityException error) {
            cameraUri = null;
            toast("暂时无法拍摄，请从相册选择。");
            launchPhotoPicker(false);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != TAKE_PHOTO && requestCode != PICK_PHOTO) return;
        if (resultCode != RESULT_OK) {
            finishFileChoice(null);
            return;
        }
        if (requestCode == TAKE_PHOTO) {
            finishFileChoice(cameraUri == null ? null : new Uri[]{cameraUri});
            return;
        }
        ArrayList<Uri> images = new ArrayList<>();
        if (data != null && data.getClipData() != null) {
            ClipData clip = data.getClipData();
            for (int i = 0; i < clip.getItemCount(); i++) addImageUri(images, clip.getItemAt(i).getUri());
        } else if (data != null) addImageUri(images, data.getData());
        finishFileChoice(images.isEmpty() ? null : images.toArray(new Uri[0]));
    }

    private void addImageUri(ArrayList<Uri> images, Uri uri) {
        if (uri == null || !"content".equals(uri.getScheme())) return;
        try {
            String type = getContentResolver().getType(uri);
            if (type != null && type.startsWith("image/")) images.add(uri);
        } catch (SecurityException ignored) {
            toast("无法读取这张照片，请重新选择。");
        }
    }

    private void finishFileChoice(Uri[] images) {
        if (fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(images);
        }
        cameraUri = null;
    }

    private void clearOldCameraFiles() {
        File[] files = new File(getCacheDir(), "meal-photos").listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
        for (File file : files) if (file.isFile() && file.lastModified() < cutoff) file.delete();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (webView == null) { finish(); return; }
        webView.evaluateJavascript("(function(){var d=document.querySelectorAll('dialog[open]');"
                + "if(d.length){d[d.length-1].close();return true;}return false;})()", closed -> {
            if ("true".equals(closed)) return;
            if (webView.canGoBack()) webView.goBack();
            else finish();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        if (webView != null) webView.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (appUpdater != null) appUpdater.close();
        updateReplies.clear();
        finishFileChoice(null);
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
