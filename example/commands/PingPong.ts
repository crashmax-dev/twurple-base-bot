import { BaseCommand, TwurpleClient, ChatMessage } from '../../src'

export default class PingPong extends BaseCommand {
  constructor(client: TwurpleClient) {
    super(client, {
      name: 'ping',
      userlevel: 'everyone'
    })
  }

  async run(msg: ChatMessage): Promise<void> {
    msg.reply('pong!')
  }
}