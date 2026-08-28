package com.yiyu.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.appcompat.app.AppCompatActivity;

public class SplashActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            PrefManager pref = new PrefManager(this);
            Intent intent;
            if (pref.isVerified() && pref.getCardKey() != null) {
                intent = new Intent(this, MainActivity.class);
            } else {
                intent = new Intent(this, CardKeyActivity.class);
            }
            startActivity(intent);
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, 1500);
    }
}
