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
import fs from "fs"

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

let hhh = {
    phone: {
        status: false,
        creator: `@riiycs`,
        code: 406,
        message: 'Masukan parameter Phone'
    },
    error: {
    	status: false,
        author: `@riiycs`,
        code: 406,
        message: 'Error, silahkan kembali ke halaman utama'
    }
}

app.get('/auth', async (req, res, next) => {
    let phone = req.query.phone
    if (!auth) return res.json(hhh.phone)
    let db = user.find(i => i.phone === phone)
    if (db !== undefined) {
        if (db.status === true) {
	        res.json({ // result
            	status: true,
                username: db.username,
                phone: db.phone,
                message: 'Nomor kamu sudah Terverifikasi'
            })
            return
        }
    }
    let pesan = `YAY🎉, Verifikasi berhasil!\n\nHai ${db.username} sekarang kamu bisa akses Hinata - Bot dengan cara ketik: #menu`
	await iya.sendMessage(db.phone, { text: pesan }).then((respon) => {
        db.status = true
	    fs.writeFileSync('./views/user.json', JSON.stringify(user, null, 2))
	    res.json({ // result
        	status: true,
            username: db.username,
            phone: db.phone,
            message: 'Auth successful'
        })
    }).catch((err) => {
        res.json(hhh.error)
    })
})

app.get('/userJson', async (req, res) => {
    res.json({
        user: user
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
