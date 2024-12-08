import config from "./config.js"
import { Client, Serialize } from "./lib/serialize.js"

import baileys from "@whiskeysockets/baileys"
const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore, jidNormalizedUser, makeCacheableSignalKeyStore, PHONENUMBER_MCC } = baileys
import { Boom } from "@hapi/boom"
import Pino from "pino"
import NodeCache from "node-cache"
import chalk from "chalk"
import readline from "readline"
import { parsePhoneNumber } from "libphonenumber-js"
import open from "open"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let user = JSON.parse(fs.readFileSync('./views/user.json'))

let iya = null;

//---------------------------------------------------------------------//

import favicon from "serve-favicon"
import express from "express"
const PORT = process.env.PORT || 8080 || 5000 || 3000

let app = express()
app.set("json spaces", 2)
app.use(favicon(__dirname +'/views/favicon.ico'))
app.use(express.static("public"))

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/docs.html')
})

app.get('/verifikasi', async (req, res) => {
    let status = false
    let message = null
    let name = req.query.name
    let phone = req.query.phone
    let kode = Math.floor(Math.random() * 10000)
	let dbx = user.find(i => i.phone === phone)
    if (dbx !== undefined) {
        if (dbx.status === false) {
            res.json({
		        status: 'waiting for verification',
		        message: 'Silahkan verifikasi kode yang dikirim oleh bot'
	        })
	        return
        }
        if (dbx.status === true) {
	        res.json({
		        status: true,
		        message: 'Nomor kamu sudah terverifikasi'
	        })
	        return
        }
    }
    if (name && phone) {
        let pesan = `Kode verifikasi kamu adalah: *${kode}*\n\nKetik *.verifikasi ${kode}* untuk memverifikasi.`
	    await iya.sendMessage(phone+'@s.whatsapp.net', { text: pesan }).then((respon) => {
            status = 'waiting for verification'
		    message = 'Kode verifikasi berhasil dikirim'
			let obj = {
				name: name,
	            phone: phone+'@s.whatsapp.net',
	            kode: kode,
			    status: false
		    }
		    user.push(obj)
	        fs.writeFileSync('./views/user.json', JSON.stringify(user, null, 2))
	    }).catch((err) => {
	        message = 'Error, silahkan kembali ke halaman utama'
	    })
    }
    res.json({
        status: status,
        message: message
    })
})

app.get('/userJson', async (req, res) => {
    res.json({
        user
    })
})

app.get('/user', (req, res) => {
    res.sendFile(__dirname + '/views/user.html')
})

//---------------------------------------------------------------------//

const store = makeInMemoryStore({ logger: Pino({ level: "fatal" }).child({ level: "fatal" }) })

// start
async function start() {
   process.on("unhandledRejection", (err) => console.error(err))

   const { state, saveCreds } = await useMultiFileAuthState(`./${config.options.sessionName}`)
   const msgRetryCounterCache = new NodeCache()

   const hisoka = baileys.default({
      logger: Pino({ level: "fatal" }).child({ level: "fatal" }),
      printQRInTerminal: true,
      auth: {
         creds: state.creds,
         keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }).child({ level: "fatal" })),
      },
      browser: ['Chrome (Linux)', '', ''],
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      getMessage: async (key) => {
         let jid = jidNormalizedUser(key.remoteJid)
         let msg = await store.loadMessage(jid, key.id)

         return msg?.message || ""
      },
      msgRetryCounterCache,
      defaultQueryTimeoutMs: undefined,
   })

   // mboh
   iya = hisoka

   // bind store
   store.bind(hisoka.ev)

   // push update
   hisoka.ev.on("contacts.update", (update) => {
      for (let contact of update) {
         let id = jidNormalizedUser(contact.id)
         if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
      }
   })

   // bind extra client
   await Client({ hisoka, store })

   // for auto restart
   hisoka.ev.on("connection.update", async (update) => {
      const { lastDisconnect, connection, qr } = update
      if (connection) {
         console.info(`Connection Status : ${connection}`)
      }

      if (connection === "close") {
         let reason = new Boom(lastDisconnect?.error)?.output.statusCode
         if (reason === DisconnectReason.badSession) {
            console.log(`Bad Session File, Please Delete Session and Scan Again`)
            process.send('reset')
         } else if (reason === DisconnectReason.connectionClosed) {
            console.log("Connection closed, reconnecting....")
            await start()
         } else if (reason === DisconnectReason.connectionLost) {
            console.log("Connection Lost from Server, reconnecting...")
            await start()
         } else if (reason === DisconnectReason.connectionReplaced) {
            console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First")
            process.exit(1)
         } else if (reason === DisconnectReason.loggedOut) {
            console.log(`Device Logged Out, Please Scan Again And Run.`)
            process.exit(1)
         } else if (reason === DisconnectReason.restartRequired) {
            console.log("Restart Required, Restarting...")
            await start()
         } else if (reason === DisconnectReason.timedOut) {
            console.log("Connection TimedOut, Reconnecting...")
            process.send('reset')
         } else if (reason === DisconnectReason.multideviceMismatch) {
            console.log("Multi device mismatch, please scan again")
            process.exit(0)
         } else {
            console.log(reason)
            process.send('reset')
         }
      }

      if (connection === "open") {
         hisoka.sendMessage(config.options.owner[0] + "@s.whatsapp.net", {
            text: `${hisoka?.user?.name || "Hisoka"} has Connected...`,
         })
         app.listen(PORT, () => {
            console.log("Server running on port " + PORT)
        })
      }
   })

   // write session
   hisoka.ev.on("creds.update", saveCreds)

   // messages
   hisoka.ev.on("messages.upsert", async (message) => {
      if (!message.messages) return
      const m = await Serialize(hisoka, message.messages[0])
      await (await import(`./mesek/msg.js?v=${Date.now()}`)).default(hisoka, m, message)
   })

   // auto reject call when user call
   hisoka.ev.on("call", async (json) => {
      if (config.options.antiCall) {
         for (const id of json) {
            if (id.status === "offer") {
               let msg = await hisoka.sendMessage(id.from, {
                  text: `Maaf untuk saat ini, Kami tidak dapat menerima panggilan, entah dalam group atau pribadi\n\nJika Membutuhkan bantuan ataupun request fitur silahkan chat owner`,
                  mentions: [id.from],
               })
               hisoka.sendContact(id.from, config.options.owner, msg)
               await hisoka.rejectCall(id.id, id.from)
            }
         }
      }
   })

   return hisoka
}

start()
