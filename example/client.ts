import { join } from 'path'
import { TwurpleClient, ChatMessage } from '../src'

const client = new TwurpleClient({
  config: join(__dirname, 'config.json')
})

client.on('message', (msg: ChatMessage) => { })

client.registerDefaultCommands()

client.registerCommandsIn(join(__dirname, 'commands'))

client.connect()