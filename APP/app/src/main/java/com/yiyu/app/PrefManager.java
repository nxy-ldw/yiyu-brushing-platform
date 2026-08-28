package com.yiyu.app;

import android.content.Context;
import android.content.SharedPreferences;

public class PrefManager {
    private static final String PREF_NAME = "yiyu_app_prefs";
    private static final String KEY_CARD_KEY = "card_key";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_CARD_EXPIRE = "card_expire";
    private static final String KEY_VERIFIED = "verified";

    private final SharedPreferences prefs;

    public PrefManager(Context context) {
        prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public void saveCardKey(String cardKey, String expireAt) {
        prefs.edit()
            .putString(KEY_CARD_KEY, cardKey)
            .putString(KEY_CARD_EXPIRE, expireAt)
            .putBoolean(KEY_VERIFIED, true)
            .apply();
    }

    public String getCardKey() {
        return prefs.getString(KEY_CARD_KEY, null);
    }

    public String getCardExpire() {
        return prefs.getString(KEY_CARD_EXPIRE, null);
    }

    public boolean isVerified() {
        return prefs.getBoolean(KEY_VERIFIED, false);
    }

    public void clearCardKey() {
        prefs.edit()
            .remove(KEY_CARD_KEY)
            .remove(KEY_CARD_EXPIRE)
            .putBoolean(KEY_VERIFIED, false)
            .apply();
    }

    public String getDeviceId() {
        String id = prefs.getString(KEY_DEVICE_ID, null);
        if (id == null) {
            id = java.util.UUID.randomUUID().toString().replace("-", "");
            prefs.edit().putString(KEY_DEVICE_ID, id).apply();
        }
        return id;
    }
}
