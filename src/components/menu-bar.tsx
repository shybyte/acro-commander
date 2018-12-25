import {Widgets} from 'blessed';
import React, {Component} from 'react';
import BoxOptions = Widgets.BoxOptions;
import Events = Widgets.Events;
import ListElement = Widgets.ListElement;
import Screen = Widgets.Screen;
import BoxElement = Widgets.BoxElement;

export interface MenuItem {
  text: string;
  keys: string[];
  isEnabled: () => boolean;
  callback: () => void;
}

interface MenuBarProps extends BoxOptions {
  menuItems: MenuItem[]
  screen: Screen;
}

interface MenuBarState {
}

export class MenuBar extends Component<MenuBarProps, MenuBarState> {
  boxRef = React.createRef<BoxElement>();

  constructor(props: MenuBarProps) {
    super(props);
    this.props.screen.on('resize', () => {
      this.forceUpdate();
    });
  }

  componentDidMount(): void {
    for (const menuItem of this.props.menuItems) {
      (this.refs[menuItem.text] as any).on('click', menuItem.callback);
    }
  }

  get width() {
    return this.props.screen.width as number;
  }

  render() {
    const buttonWidth = Math.floor(this.width / this.props.menuItems.length);
    return (
      <blessed-box
        {...this.props}
        ref={this.boxRef}
        height={1}
        style={{bg: 'cyan'}}
      >
        {this.width + '-' + buttonWidth}
        {this.props.menuItems.map((menuItem, i) =>
          <blessed-box
            key={menuItem.keys[0]}
            tags={true}
            content={getMenuItemContent(menuItem)}
            left={i * buttonWidth} width={buttonWidth}
            ref={menuItem.text}
          >
          </blessed-box>)
        }
      </blessed-box>

    );
  }
}

function getMenuItemContent(menuItem: MenuItem): string {
  const keyPart = '{#222-bg} ' + menuItem.keys[0].toUpperCase();
  const labelPart = `{cyan-bg}{#${menuItem.isEnabled() ? '000' : '666'}-fg}` + menuItem.text;
  return keyPart + labelPart
}
