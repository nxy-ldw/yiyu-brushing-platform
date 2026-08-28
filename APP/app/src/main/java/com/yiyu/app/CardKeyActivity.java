package com.yiyu.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.view.KeyEvent;

import org.json.JSONObject;

public class CardKeyActivity extends Activity {

    private EditText etCardKey;
    private Button btnVerify;
    private ProgressBar progressBar;
    private LinearLayout layoutInfo;
    private TextView tvExpireInfo;
    private PrefManager prefManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_card_key);

        prefManager = new PrefManager(this);

        etCardKey = findViewById(R.id.etCardKey);
        btnVerify = findViewById(R.id.btnVerify);
        progressBar = findViewById(R.id.progressBar);
        layoutInfo = findViewById(R.id.layoutInfo);
        tvExpireInfo = findViewById(R.id.tvExpireInfo);

        etCardKey.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override
            public void afterTextChanged(Editable s) {
                btnVerify.setEnabled(s.toString().trim().length() > 0);
            }
        });

        etCardKey.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    verifyCard();
                    return true;
                }
                return false;
            }
        });

        btnVerify.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                verifyCard();
            }
        });
    }

    private void verifyCard() {
        final String cardKey = etCardKey.getText().toString().trim();
        if (cardKey.isEmpty()) {
            Toast.makeText(this, "请输入卡密", Toast.LENGTH_SHORT).show();
            return;
        }

        setLoading(true);

        String deviceId = prefManager.getDeviceId();
        JSONObject body = new JSONObject();
        try {
            body.put("cardKey", cardKey);
            body.put("deviceId", deviceId);
        } catch (Exception e) {
            setLoading(false);
            return;
        }

        ApiClient.post("/app/verify-card", body, new ApiClient.Callback() {
            @Override
            public void onSuccess(final JSONObject response) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        setLoading(false);
                        boolean success = response.optBoolean("success", false);
                        if (success) {
                            String expireAt = response.optString("expireAt", "");
                            prefManager.saveCardKey(cardKey, expireAt);

                            layoutInfo.setVisibility(View.VISIBLE);
                            tvExpireInfo.setText("到期时间: " + expireAt);
                            Toast.makeText(CardKeyActivity.this, "验证成功", Toast.LENGTH_SHORT).show();

                            new Handler(getMainLooper()).postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    Intent intent = new Intent(CardKeyActivity.this, MainActivity.class);
                                    startActivity(intent);
                                    overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
                                    finish();
                                }
                            }, 1000);
                        } else {
                            Toast.makeText(CardKeyActivity.this, "验证失败", Toast.LENGTH_SHORT).show();
                        }
                    }
                });
            }

            @Override
            public void onError(final String message) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        setLoading(false);
                        Toast.makeText(CardKeyActivity.this, message, Toast.LENGTH_LONG).show();
                    }
                });
            }
        });
    }

    private void setLoading(boolean loading) {
        if (loading) {
            progressBar.setVisibility(View.VISIBLE);
            btnVerify.setVisibility(View.GONE);
            btnVerify.setEnabled(false);
        } else {
            progressBar.setVisibility(View.GONE);
            btnVerify.setVisibility(View.VISIBLE);
            btnVerify.setEnabled(etCardKey.getText().toString().trim().length() > 0);
        }
    }
}
