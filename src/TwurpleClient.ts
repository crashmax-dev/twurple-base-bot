import Lowdb from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import EventEmitter from 'events'
import { readdirSync } from 'fs'
import { join } from 'path'

import { ApiClient } from '@twurple/api'
import { ChatUserstate, Client } from '@twurple/auth-tmi'
import { AccessToken, RefreshConfig, RefreshingAuthProvider } from '@twurple/auth'

import { Logger } from './Logger'
import { BaseCommand } from './BaseCommand'
import { ChatMessage, ChatterState } from './ChatMessage'
import { CommandArguments, CommandParser } from './CommandParser'

export type TwurpleTokens = AccessToken & Omit<RefreshConfig, 'onRefresh'>

export interface TwurpleConfig extends TwurpleTokens {
  channels: string[]
  botOwners: string[]
  prefix: string
}

export interface TwurpleOptions {
  config: string
}

export class TwurpleClient extends EventEmitter {
  public config: TwurpleConfig
  public tmi: Client
  public auth: RefreshingAuthProvider
  public api: ApiClient
  public commands: BaseCommand[]
  public logger: typeof Logger

  private options: TwurpleOptions
  private parser: typeof CommandParser
  private db: Lowdb.LowdbSync<TwurpleConfig>

  constructor(options: TwurpleOptions) {
    super()

    this.options = options
    this.commands = []
    this.logger = Logger
    this.parser = CommandParser

    this.db = Lowdb(new FileSync<TwurpleConfig>(options.config))
    this.logger.info('Loading config file..')
    this.config = this.db.getState()
  }

  async connect(): Promise<void> {
    this.logger.info('Current default prefix is ' + this.config.prefix)

    this.auth = new RefreshingAuthProvider(
      {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        onRefresh: (tokens) => {
          this.logger.info('Refreshing auth tokens..')
          this.db.assign(tokens).write()
        }
      },
      this.config
    )

    this.api = new ApiClient({
      authProvider: this.auth,
      logger: {
        timestamps: true,
        colors: true,
        emoji: true,
        minLevel: 3
      }
    })

    this.tmi = new Client({
      options: {
        debug: true
      },
      connection: {
        secure: true,
        reconnect: true
      },
      authProvider: this.auth,
      channels: this.config.channels,
      logger: this.logger
    })

    this.tmi.on('message', this.onMessage.bind(this))
    await this.tmi.connect()
  }

  registerDefaultCommands(): void {
    this.registerCommandsIn(join(__dirname, 'commands'))
  }

  registerCommandsIn(path: string): void {
    readdirSync(path)
      .filter(file => !file.includes('.d.ts'))
      .forEach(file => {
        let commandFile = require(join(path, file))

        if (typeof commandFile.default === 'function') {
          commandFile = commandFile.default
        }

        if (commandFile.prototype instanceof BaseCommand) {
          const command: BaseCommand = new commandFile(this)
          this.logger.info(`Register command ${command.options.name}`)
          this.commands.push(command)
        } else {
          this.logger.warn(`${file} is not an instance of BaseCommand`)
        }
      }, this)
  }

  private async onMessage(channel: string, userstate: ChatUserstate, messageText: string, self: boolean): Promise<void> {
    if (self) {
      return
    }

    const chatter = { ...userstate, message: messageText } as ChatterState
    const msg = new ChatMessage(this, chatter, channel)

    if (msg.author.username === this.getUsername()) {
      if (!(msg.author.isBroadcaster || msg.author.isModerator || msg.author.isVip)) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    this.emit('message', msg)

    const parserResult = this.parser.parse(messageText, this.config.prefix)

    if (parserResult) {
      const command = this.findCommand(parserResult)

      if (command) {
        const preValidateResponse = command.preValidate(msg)

        if (typeof preValidateResponse !== 'string') {
          command.prepareRun(msg, parserResult.args)
        } else {
          msg.reply(preValidateResponse)
        }
      }
    }
  }

  findCommand(parserResult: Partial<CommandArguments>): BaseCommand {
    return this.commands.find(command => {
      if (command.options.aliases?.includes(parserResult.command)) {
        return command
      }

      if (parserResult.command === command.options.name) {
        return command
      }
    })
  }

  execCommand(command: string, msg: ChatMessage): void {
    const cmd = this.findCommand({ command })

    if (cmd.constructor.prototype.hasOwnProperty('execute')) {
      cmd.execute(msg)
    }
  }

  async say(channel: string, message: string): Promise<[string]> {
    return await this.tmi.say(channel, message)
  }

  async action(channel: string, message: string): Promise<[string]> {
    return await this.tmi.action(channel, message)
  }

  async whisper(username: string, message: string): Promise<[string, string]> {
    return await this.tmi.whisper(username, message)
  }

  getUsername(): string {
    return this.tmi.getUsername()
  }

  getChannels(): string[] {
    return this.tmi.getChannels()
  }
}