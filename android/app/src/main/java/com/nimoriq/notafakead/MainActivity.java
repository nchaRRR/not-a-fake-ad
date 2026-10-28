package com.nimoriq.notafakead;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.ActionBar;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // BridgeActivity switches to AppTheme.NoActionBar and creates the WebView. Edge-to-edge must
        // come AFTER that: calling it earlier builds the window with the launch (splash) theme, which
        // on Android 12+ carries a framework action bar — the empty strip at the top of the game.
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        hideTitleBar();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        // The phone's "font size" setting must not blow up the game UI (labels overflowing the
        // bottom menu); the game scales itself to the screen instead.
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) wv.getSettings().setTextZoom(100);
    }

    @Override
    public void onResume() {
        super.onResume();
        hideTitleBar();
    }

    /** Belt and braces: no title / action bar of any kind over the game. */
    private void hideTitleBar() {
        ActionBar bar = getSupportActionBar();
        if (bar != null) bar.hide();
        android.app.ActionBar fw = getActionBar();
        if (fw != null) fw.hide();
        setTitle("");
    }
}
