import config from "../config.js"
import Func from "../lib/function.js"

import { quote } from "../lib/quote.js"
import { tiktok } from "../lib/tiktok.js"

import fs from "fs"
import chalk from "chalk"
import axios from "axios"
import baileys from "@whiskeysockets/baileys"
import path from "path"
import { getBinaryNodeChildren } from "@whiskeysockets/baileys"
import { exec } from "child_process"
import { format } from "util"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const __filename = Func.__filename(import.meta.url)
const require = createRequire(import.meta.url)

// db
let user = JSON.parse(fs.readFileSync('./views/user.json'))

export default async function Message(hisoka, m, chatUpdate) {
    try {
        if (!m) return
        if (!config.options.public && !m.isOwner) return
        if (m.isBaileys) return

        const prefix = m.prefix
        const isCmd = m.body.startsWith(prefix)
        const command = isCmd ? m.command.toLowerCase() : ""
        const quoted = m.isQuoted ? m.quoted : m

        if (!m.isGroup && !isCmd && !m.key.fromMe) {
            if (m.body.toLowerCase()) {
                let req = await Func.fetchJson(`https://acawapi.vercel.app/v2/acaw?q=${m.body}`)
                return m.reply(req.data.result)
            }
        }
        if (m.isGroup && !isCmd && !m.key.fromMe) {
            if (m.body.toLowerCase()) {
            	if (quoted.key.fromMe == true) {
            	    let req = await Func.fetchJson(`https://acawapi.vercel.app/v2/acaw?q=${m.body}`)
                    return m.reply(req.data.result)
                }
            }
        }

        // verifikasi auth
        let cekForChat = false
        if (isCmd) {
            let anu = command.split(prefix)[0]
            let filter = ["daftar"]
            if (filter.includes(anu)) cekForChat = true
        }
        if (isCmd && !m.key.fromMe !cekForChat) {
            let db = user.find(i => i.number === m.sender)
            if (db === undefined) return m.reply(`Nomor kamu belum Terdaftar di Database, kirim Perintah: ${prefix}daftar`)
            if (db !== undefined) {
                if (!m.isGroup) {
                	if (db.status === false) {
                    	let text = `Verifikasi Auth(diperlukan)❗\n\nKlik link dibawah untuk Verifikasi Auth👇\n\n\nNote: Jangan bagikan link Verifikasi Auth ke orang lain!`
                        return m.reply(text)
                    }
                } if (m.isGroup) {
                	if (db.status === false) {
                        let text = `Verifikasi Auth(diperlukan)❗\n\nSilahkan cek link Verifikasi Auth di chat pribadi`
                        let text2 = `Verifikasi Auth(diperlukan)❗\n\nKlik link dibawah untuk Verifikasi Auth👇\n\n\nNote: Jangan bagikan link Verifikasi Auth ke orang lain!`
                        m.reply(text)
                        hisoka.sendMessage(db.number, { text: text2 })
                        return
                    }
                }
            }
        }

        // log chat
        if (isCmd && !m.isBaileys) {
            console.log(`${m.pushName} - ${m.sender}\n${m.isGroup ? m.metadata.subject : "Private Chat", m.from} - ${m.body || m.type}`)
        }

        switch (command) {
        	// main
            case "daftar": {
            	let db = user.find(i => i.number === m.sender)
                if (db !== undefined) {
                	if (db.status === true) return m.reply("Nomor kamu sudah Terverifikasi!")
                    if (db.status === false) return m.reply("Menunggu Verifikasi Auth...")
                }
            	if (!m.text) return m.reply(`Penggunaan: ${prefix + command} Nama\n\nContoh: ${prefix + command} Hinata`)
                let obj = {
                	status: false,
                    auth: Func.getRandom(),
                    name: m.text,
                    number: m.sender
                }
                user.push(obj)
                fs.writeFileSync('./views/user.json', JSON.stringify(user, null, 2))
                if (!m.isGroup) {
                	let text = `Verifikasi Auth(diperlukan)❗\n\nKlik link dibawah untuk Verifikasi Auth👇\n\n\nNote: Jangan berikan link Verifikasi Auth ke orang lain!`
                    return m.reply(text)
                } else if (m.isGroup) {
                    let text = `Verifikasi Auth(diperlukan)❗\n\nSilahkan cek link Verifikasi Auth di chat pribadi`
                    let text2 = `Verifikasi Auth(diperlukan)❗\n\nKlik link dibawah untuk Verifikasi Auth👇\n\n\nNote: Jangan berikan link Verifikasi Auth ke orang lain!`
                    m.reply(text)
                    hisoka.sendMessage(m.sender, { text: text2 })
                    return
                }
            }
            break
        	case "menu": case "help": {
                let text = `*List*
${prefix}help
${prefix}owner
${prefix}request
${prefix}tiktok
${prefix}sticker
${prefix}toimage
${prefix}faketweet
${prefix}quote

© 2024 - @0`
                return m.reply(text)
            }
            break
            case "owner": {
                hisoka.sendContact(m.from, config.options.owner, m)
            }
            break
            case "request": case "req": {
            	if (!m.text) return m.reply(`Penggunaan: ${prefix + command} Request\n\nContoh: ${prefix + command} Request fitur game min`)
                let text = `*Request*\n${m.text}\n\n*From*\n@${m.sender.split`@`[0]}`
                hisoka.sendMessage(`6281575886399@s.whatsapp.net`, { text, mentions: [m.sender] })
            }
            break
            // downloader
            case "tiktok": case "tt": {
                if (!/https?:\/\/(www\.|v(t|m|vt)\.|t\.)?tiktok\.com/i.test(m.text)) return m.reply(`Kirim perintah ${prefix + command} link`)
                try {
                    let req = await tiktok(Func.isUrl(m.text)[0])
                    m.reply(req.no_watermark, { caption: `${req.title}` })
                } catch (error) {
                	m.reply(`An error occurred: ${error.message}`)
                }
            }
            break
            // converter
            case "sticker": case "s": case "stiker": {
                if (/image|video|webp/i.test(quoted.mime)) {
                	m.reply("wait")
                    const buffer = await quoted.download()
                    if (quoted?.msg?.seconds > 10) return m.reply(`Durasi video maks 9 detik`)
                    let exif
                    if (m.text) {
                        let [packname, author] = m.text.split("|")
                        exif = { packName: packname ? packname : "", packPublish: author ? author : "" }
                    } else {
                        exif = { ...config.Exif }
                    }
                    m.reply(buffer, { asSticker: true, ...exif })
                } else if (m.mentions[0]) {
                    m.reply("wait")
                    let url = await hisoka.profilePictureUrl(m.mentions[0], "image");
                    m.reply(url, { asSticker: true, ...config.Exif })
                } else if (/(https?:\/\/.*\.(?:png|jpg|jpeg|webp|mov|mp4|webm|gif))/i.test(m.text)) {
                    m.reply("wait")
                    m.reply(Func.isUrl(m.text)[0], { asSticker: true, ...config.Exif })
                } else {
                    return m.reply(`Balas/Reply media dengan caption ${prefix + command}`)
                }
            }
            break
            case "toimg": case "toimage": {
                let { webp2mp4File } = (await import("../lib/sticker.js"))
                if (!/webp/i.test(quoted.mime)) return m.reply(`Balas/Reply sticker dengan caption ${prefix + command}`)
                if (quoted.isAnimated) {
                	m.reply("wait")
                    let media = await webp2mp4File((await quoted.download()))
                    m.reply(media)
                }
                m.reply("wait")
                let media = await quoted.download()
                m.reply(media, { mimetype: "image/png" })
            }
            break
            case "faketweet": case "ft": {
                const canvafy = require("canvafy")
                if (!m.text) return m.reply(`Penggunaan: ${prefix + command} Nama|username|Text\n\nContoh: ${prefix + command} Riy|riycs|Hai`)
                let [nama1, nama2, text] = m.text.split("|")
                let profile = await hisoka.profilePictureUrl(m.sender, "image").catch(_=> "https://telegra.ph/file/6880771a42bad09dd6087.jpg")
                if (!nama2) return m.reply(`Masukkan username!\n\n*Penggunaan:*\n${prefix + command} Riy|riycs|Hai`)
                if (!text) return m.reply(`Masukkan text!\n\n*Penggunaan:*\n${prefix + command} Riy|riycs|Hai`)
                try {
                    m.reply("wait")
                    const tweet = await new canvafy.Tweet()
                    .setTheme("dim")
                    .setUser({ displayName: nama1, username: nama2 })
                    .setVerified(true)
                    .setComment(text)
                    .setAvatar(profile)
                    .build();
                    let result = tweet
                    m.reply(result, { mimetype: "image/png" })
                } catch (error) {
                	return m.reply(`An error occurred: ${error.message}`)
                }
            }
            break
            case "quote": case "qc": {
            	if (!m.text) return m.reply(`Penggunaan: ${prefix + command} Text\n\nContoh: ${prefix + command} Hai`)
            	try {
                	let profile = await hisoka.profilePictureUrl(m.sender, "image").catch(_=> "https://telegra.ph/file/6880771a42bad09dd6087.jpg")
                    const njepat = await quote(m.text, m.pushName, profile)
                    m.reply("wait")
                    m.reply(njepat.result, { asSticker: true, ...config.Exif })
                } catch (error) {
                	return m.reply(`An error occurred: ${error.message}`)
                }
            }
            break
            // baileys
            case "readvo": {
                if (!m.isOwner) return
                if (!quoted.msg.viewOnce) return m.reply(`Reply/Balas ViewOnce dengan caption ${prefix + command}`)
                quoted.msg.viewOnce = false
                hisoka.sendMessage(m.from, { forward: quoted }, { quoted: m })
            }
            break
            case "hidetag": case "ht": {
                if (!m.isGroup) return
                if (!m.isAdmin) return
                let mentions = m.metadata.participants.map(a => a.id)
                let mod = await hisoka.cMod(m.from, quoted, /hidetag|tag|ht|h|totag/i.test(quoted.body.toLowerCase()) ? quoted.body.toLowerCase().replace(prefix + command, "") : quoted.body)
                hisoka.sendMessage(m.from, { forward: mod, mentions }, { quoted: m })
            }
            break
            default:
                if (["x"].some(a => m.body?.toLowerCase()?.startsWith(a))) {
                    if (!m.isOwner) return
                    let evalCmd = ""
                    try {
                        evalCmd = /await/i.test(m.text) ? eval("(async() => { " + m.text + " })()") : eval(m.text)
                    } catch (e) {
                        evalCmd = e
                    }
                    new Promise(async (resolve, reject) => {
                        try {
                            resolve(evalCmd);
                        } catch (err) {
                            reject(err)
                        }
                    })
                        ?.then((res) => m.reply(format(res)))
                        ?.catch((err) => m.reply(format(err)))
                }

                if (["$"].some(a => m.body?.toLowerCase()?.startsWith(a))) {
                    if (!m.isOwner) return
                    try {
                        exec(m.text, async (err, stdout) => {
                            if (err) return m.reply(Func.format(err))
                            if (stdout) return m.reply(Func.format(stdout))
                        })
                    } catch (e) {
                        m.reply(Func.format(e))
                    }
                }
        }
    } catch (e) {
        m.reply(format(e))
    }
}
