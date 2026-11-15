<template>
    <div class="qr-box" v-if="qr">
        <svg class="qr-svg" :viewBox="'0 0 ' + qr.size + ' ' + qr.size" :width="pixels" :height="pixels" role="img"
            :aria-label="label" shape-rendering="crispEdges">
            <rect :width="qr.size" :height="qr.size" fill="#ffffff" />
            <path :d="qr.path" fill="#000000" />
        </svg>
        <button type="button" class="btn btn-cinza qr-download" v-on:click="download()">Baixar QR Code (SVG)</button>
    </div>
</template>

<script>
import { buildQr, qrSvgMarkup } from '../../utils/qr.js';

// QR Code do link de WhatsApp. O SVG é montado por elementos do template (o caminho só tem números).
export default {
    props: {
        text: { type: String, default: "" },
        pixels: { type: Number, default: 192 },
        label: { type: String, default: "QR Code para abrir o WhatsApp da empresa" },
        filename: { type: String, default: "qrcode-whatsapp.svg" }
    },
    computed: {
        qr() {
            return buildQr(this.text);
        }
    },
    methods: {
        download() {
            const markup = qrSvgMarkup(this.qr);
            if (!markup) return;
            const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = this.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }
}
</script>

<style scoped>
.qr-box {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
}

.qr-svg {
    border: 1px solid var(--cinza-medio);
    border-radius: var(--radius-md);
    background: #ffffff;
    max-width: 100%;
    height: auto;
}

.qr-download {
    width: auto;
    max-width: none;
}
</style>
