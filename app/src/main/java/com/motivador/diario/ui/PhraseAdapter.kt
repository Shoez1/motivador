package com.motivador.diario.ui

import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.net.Uri
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.motivador.diario.R
import com.motivador.diario.data.PhraseEntity
import com.motivador.diario.databinding.ItemPhraseBinding
import com.motivador.diario.worker.FetchPhraseWorker
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PhraseAdapter :
    ListAdapter<PhraseEntity, PhraseAdapter.VH>(PhraseDiffCallback()) {

    private val df = SimpleDateFormat("dd/MM HH:mm", Locale.getDefault())

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        val binding = ItemPhraseBinding.inflate(inflater, parent, false)
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.bind(getItem(position), df)
    }

    class VH(private val binding: ItemPhraseBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(item: PhraseEntity, df: SimpleDateFormat) {
            binding.phraseText.text = item.texto

            if (item.autor.isNotBlank()) {
                binding.phraseAuthor.text = "- ${item.autor}"
                binding.phraseAuthor.setTextColor(
                    ContextCompat.getColor(binding.root.context, R.color.accent_color)
                )
                binding.phraseAuthor.paintFlags =
                    binding.phraseAuthor.paintFlags or Paint.UNDERLINE_TEXT_FLAG
                binding.phraseAuthor.setOnClickListener {
                    openAuthorSearch(binding.root.context, item.autor)
                }
            } else {
                binding.phraseAuthor.text = ""
                binding.phraseAuthor.setTextColor(
                    ContextCompat.getColor(binding.root.context, R.color.text_secondary)
                )
                binding.phraseAuthor.paintFlags =
                    binding.phraseAuthor.paintFlags and Paint.UNDERLINE_TEXT_FLAG.inv()
                binding.phraseAuthor.setOnClickListener(null)
            }

            val whenText = df.format(Date(item.receivedAt))
            val periodoLabel = when (item.periodo) {
                FetchPhraseWorker.PERIODO_MANHA -> "Motivacao da manha (05:00)"
                FetchPhraseWorker.PERIODO_TARDE -> "Motivacao da tarde (18:00)"
                else -> item.periodo
            }

            binding.phraseMeta.text = "$periodoLabel - ${item.tipo} - $whenText"
        }

        private fun openAuthorSearch(context: Context, author: String) {
            try {
                val q = URLEncoder.encode(author, "UTF-8")
                val url = "https://www.google.com/search?q=$q"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                intent.addCategory(Intent.CATEGORY_BROWSABLE)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } catch (_: Exception) {
                // Keep the row responsive even if no browser is available.
            }
        }
    }
}

private class PhraseDiffCallback : DiffUtil.ItemCallback<PhraseEntity>() {
    override fun areItemsTheSame(oldItem: PhraseEntity, newItem: PhraseEntity): Boolean {
        return oldItem.localId == newItem.localId
    }

    override fun areContentsTheSame(oldItem: PhraseEntity, newItem: PhraseEntity): Boolean {
        return oldItem == newItem
    }
}
