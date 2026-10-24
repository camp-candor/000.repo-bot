import type Bus from './fce/bus.interface'
import BusBit from './fce/bus.interface'

export class BusModel implements Bus {
    MQTT: any
    //idx:string;
    //busBitList: BusBit[] = [];
    //busBits: any = {};
    actList: any
    client: any
    host = 'mqtt://localhost:1883'
    bus: Function
    responseSuffix = '-response'
    promises: any = {}
}
