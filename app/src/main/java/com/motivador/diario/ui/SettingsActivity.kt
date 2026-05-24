package com.motivador.diario.ui

import android.content.SharedPreferences
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.motivador.diario.databinding.ActivitySettingsBinding

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private lateinit var prefs: SharedPreferences

    companion object {
        const val PREFS_NAME = "motivador_prefs"
        const val KEY_SHOW_REFRESH_BUTTON = "show_refresh_button"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)

        setupToolbar()
        setupSwitch()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.apply {
            setDisplayHomeAsUpEnabled(true)
            title = "Configurações"
        }
    }

    private fun setupSwitch() {
        val showButton = prefs.getBoolean(KEY_SHOW_REFRESH_BUTTON, false)
        binding.switchShowRefreshButton.isChecked = showButton

        binding.switchShowRefreshButton.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit()
                .putBoolean(KEY_SHOW_REFRESH_BUTTON, isChecked)
                .apply()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
