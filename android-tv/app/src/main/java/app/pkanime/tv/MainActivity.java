package app.pkanime.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * PK Anime for Fire TV and Android TV: a full-screen WebView on the user's own PK Anime server.
 * The site itself is loaded live every time, so updating the server updates the app; this shell
 * only changes for things the page can't do on its own:
 *
 * - The remote's Back and media keys never reach a page in a WebView, so they're sent to it as
 *   key events ("GoBack", "MediaPlayPause"…), which the TV interface already understands.
 *   Back the page doesn't use goes back in the WebView's history, then leaves the app.
 * - window.PKAnimeTV.exit() lets the page close the app (Back on the library's home screen).
 * - Video plays without a key press first and can go full screen.
 * - The Menu key (≡) offers reload, changing the server address and leaving.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "pkanime";
    private static final String KEY_URL = "server_url";
    private static final String DEFAULT_URL = "http://pk.nord";
    private static final int BACKGROUND = 0xFF0C0B10;

    /** Sends a key to the page; answers "true" when the page handled it (preventDefault) */
    private static final String SEND_KEY_JS =
            "(function(k){var t=document.activeElement||document.body||document.documentElement;"
                    + "if(!t)return false;var o={key:k,code:k,bubbles:true,cancelable:true};"
                    + "var handled=!t.dispatchEvent(new KeyboardEvent('keydown',o));"
                    + "t.dispatchEvent(new KeyboardEvent('keyup',o));return handled;})";

    private FrameLayout root;
    private WebView web;
    private Chrome chrome;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private AlertDialog dialog;
    private String serverUrl;
    private boolean mainFrameFailed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        setContentView(root);

        web = createWebView();
        root.addView(web, fill());

        serverUrl = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, null);
        if (serverUrl == null) askServer(true);
        else loadServer();
    }

    private static FrameLayout.LayoutParams fill() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private WebView createWebView() {
        // chrome://inspect from a computer, over adb, to debug the page on the TV
        WebView.setWebContentsDebuggingEnabled(true);

        WebView view = new WebView(this);
        view.setBackgroundColor(BACKGROUND);
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // The server picks the TV interface from this; Fire TV's own "AFT…" model is in there too
        settings.setUserAgentString(settings.getUserAgentString() + " PKAnimeTV/" + versionName());

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(view, true);

        chrome = new Chrome();
        view.setWebViewClient(new Client());
        view.setWebChromeClient(chrome);
        view.addJavascriptInterface(new Bridge(), "PKAnimeTV");
        return view;
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1";
        }
    }

    // ---- the server ----------------------------------------------------------------------------

    private void loadServer() {
        mainFrameFailed = false;
        // ?ui=tv: the TV interface even on a server too old to know this app's User-Agent
        String url = Uri.parse(serverUrl).buildUpon().appendQueryParameter("ui", "tv").build().toString();
        web.loadUrl(url);
        web.requestFocus();
    }

    /** "pk.nord", "192.168.1.50:3000/" → "http://pk.nord", "http://192.168.1.50:3000"; null if it isn't an address */
    private static String normalize(String input) {
        String text = input == null ? "" : input.trim();
        if (text.isEmpty()) return null;
        if (!text.matches("(?i)^https?://.*")) text = "http://" + text;
        while (text.endsWith("/")) text = text.substring(0, text.length() - 1);
        Uri uri = Uri.parse(text);
        return uri.getHost() == null || uri.getHost().isEmpty() ? null : text;
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private AlertDialog.Builder dialogBuilder() {
        return new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert);
    }

    private void closeDialog() {
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        dialog = null;
    }

    /** Asks for the server's address; the first time, leaving it means leaving the app */
    private void askServer(final boolean first) {
        closeDialog();

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(24), dp(8), dp(24), 0);

        TextView hint = new TextView(this);
        hint.setText("La dirección donde tienes PK Anime en marcha, por ejemplo http://pk.nord o http://192.168.1.50:3000");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        layout.addView(hint);

        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setText(serverUrl != null ? serverUrl : DEFAULT_URL);
        input.setSelection(input.getText().length());
        layout.addView(input);

        dialog = dialogBuilder()
                .setTitle("Servidor de PK Anime")
                .setView(layout)
                .setPositiveButton("Conectar", null)
                .setNegativeButton(first ? "Salir" : "Cancelar", null)
                .create();
        dialog.setOnCancelListener(new DialogInterface.OnCancelListener() {
            @Override
            public void onCancel(DialogInterface d) {
                if (first) finish();
            }
        });
        final AlertDialog shown = dialog;
        dialog.setOnShowListener(new DialogInterface.OnShowListener() {
            @Override
            public void onShow(DialogInterface d) {
                shown.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        submitServer(input);
                    }
                });
                shown.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        closeDialog();
                        if (first) finish();
                    }
                });
            }
        });
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                submitServer(input);
                return true;
            }
        });
        dialog.show();
    }

    private void submitServer(EditText input) {
        String url = normalize(input.getText().toString());
        if (url == null) {
            input.setError("Escribe una dirección válida");
            return;
        }
        serverUrl = url;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, url).apply();
        closeDialog();
        loadServer();
    }

    private void showMenu() {
        closeDialog();
        String[] items = {"Recargar", "Cambiar de servidor", "Salir de PK Anime"};
        dialog = dialogBuilder()
                .setTitle("PK Anime")
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        dialog = null;
                        if (which == 0) loadServer();
                        else if (which == 1) askServer(false);
                        else finish();
                    }
                })
                .create();
        dialog.show();
    }

    private void showError(String description) {
        if (dialog != null && dialog.isShowing()) return;
        dialog = dialogBuilder()
                .setTitle("No se puede conectar")
                .setMessage("No hay respuesta de " + serverUrl + " (" + description + ").\n\n"
                        + "Comprueba que el servidor está en marcha y que esta TV llega a esa dirección.")
                .setPositiveButton("Reintentar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        dialog = null;
                        loadServer();
                    }
                })
                .setNeutralButton("Cambiar de servidor", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        dialog = null;
                        askServer(false);
                    }
                })
                .setNegativeButton("Salir", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        finish();
                    }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    @Override
                    public void onCancel(DialogInterface d) {
                        finish();
                    }
                })
                .create();
        dialog.show();
    }

    // ---- the remote ----------------------------------------------------------------------------

    private void sendKey(String key, ValueCallback<String> result) {
        web.evaluateJavascript(SEND_KEY_JS + "('" + key + "')", result);
    }

    private static String mediaKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "MediaPlay";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "MediaPause";
            case KeyEvent.KEYCODE_MEDIA_STOP: return "MediaStop";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "MediaFastForward";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "MediaRewind";
            default: return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean up = event.getAction() == KeyEvent.ACTION_UP;

        if (code == KeyEvent.KEYCODE_BACK) {
            if (up && !event.isCanceled()) onRemoteBack();
            return true;
        }
        if (code == KeyEvent.KEYCODE_MENU) {
            if (up) showMenu();
            return true;
        }
        String media = mediaKey(code);
        if (media != null) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) sendKey(media, null);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void onRemoteBack() {
        if (mainFrameFailed) {
            finish();
            return;
        }
        sendKey("GoBack", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if ("true".equals(handled)) return;
                if (fullscreenView != null) {
                    web.evaluateJavascript("document.fullscreenElement&&document.exitFullscreen()", null);
                    chrome.onHideCustomView();
                } else if (web.canGoBack()) {
                    web.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    /** What the page can ask of the app, as window.PKAnimeTV */
    private class Bridge {
        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return versionName();
        }
    }

    // ---- the WebView ---------------------------------------------------------------------------

    private class Client extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            mainFrameFailed = false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                mainFrameFailed = true;
                showError(String.valueOf(error.getDescription()));
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            // Before Android 6 only this one exists, and only for the page itself
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                mainFrameFailed = true;
                showError(description);
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return !isWebUrl(url);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !isWebUrl(request.getUrl().toString());
        }

        /** Every web page stays in the app (MyAnimeList sign-in included); other schemes go nowhere */
        private boolean isWebUrl(String url) {
            String lower = url.toLowerCase();
            return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("about:");
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (fullscreenView == null) view.requestFocus();
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden();
                return;
            }
            fullscreenView = view;
            fullscreenCallback = callback;
            root.addView(view, fill());
            web.setVisibility(View.GONE);
            view.requestFocus();
        }

        @Override
        public void onHideCustomView() {
            if (fullscreenView == null) return;
            root.removeView(fullscreenView);
            fullscreenView = null;
            web.setVisibility(View.VISIBLE);
            web.requestFocus();
            if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }

        /** Without this, a paused or loading video shows Android's grey play icon */
        @Override
        public Bitmap getDefaultVideoPoster() {
            return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        }
    }

    // ---- lifecycle -----------------------------------------------------------------------------

    @Override
    protected void onPause() {
        // Home or another app: the video stops instead of playing on unseen
        web.evaluateJavascript("Array.prototype.forEach.call(document.querySelectorAll('video'),function(v){v.pause()})", null);
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        closeDialog();
        root.removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
